import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { Response } from 'express';
import axios from 'axios';
import {
  DecisionGraph,
  OntologyCondition,
  OntologyAction,
  ConditionOperator,
  TestScenarioEvent,
} from './interfaces/decision-graph.interface';
import { ScenarioHydratorService } from './scenario-hydrator.service';

@Injectable()
export class ScenarioEvaluatorService {
  private readonly logger = new Logger(ScenarioEvaluatorService.name);

  constructor(
    private readonly hydrator: ScenarioHydratorService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Run a full test scenario, streaming SSE events to the response.
   */
  async runTestScenario(
    project: string,
    graph: DecisionGraph,
    editedProperties: Record<string, Record<string, string>>,
    res: Response,
  ): Promise<void> {
    // 1. Hydrate entities (get real data, then overlay user edits)
    const hydration = await this.hydrator.hydrate(project, graph);
    for (const entity of hydration.entities) {
      if (editedProperties[entity.entityId]) {
        entity.properties = {
          ...entity.properties,
          ...editedProperties[entity.entityId],
        };
      }
    }

    // Build lookup: entityId -> properties
    const entityProps = new Map<string, Record<string, string>>();
    for (const entity of hydration.entities) {
      entityProps.set(entity.entityId, entity.properties);
    }

    // Build lookup: conditionId -> nodeId, actionId -> nodeId
    const condNodeMap = new Map<string, string>();
    const actionNodeMap = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.conditionId) condNodeMap.set(node.conditionId, node.id);
      if (node.actionId) actionNodeMap.set(node.actionId, node.id);
    }

    // Build edge map: source nodeId -> edges
    const edgesBySource = new Map<string, typeof graph.edges>();
    for (const edge of graph.edges) {
      if (!edgesBySource.has(edge.source))
        edgesBySource.set(edge.source, []);
      edgesBySource.get(edge.source)!.push(edge);
    }

    // 2. Evaluate each condition
    const conditionResults = new Map<string, boolean>();

    for (const cond of graph.conditions) {
      const nodeId = condNodeMap.get(cond.id);
      const props = cond.targetEntityId
        ? entityProps.get(cond.targetEntityId)
        : {};
      const propValue = props?.[cond.property];

      let result: boolean;
      try {
        result = this.evaluateCondition(cond.operator, propValue, cond.value);
      } catch {
        // Fallback to LLM evaluation for complex conditions
        result = await this.evaluateConditionWithLlm(cond, props || {});
      }

      conditionResults.set(cond.id, result);

      // Find edges to highlight (match on edge.condition === "true"/"false")
      const nodeEdges = edgesBySource.get(nodeId || '') || [];
      const activeEdgeIds = nodeEdges
        .filter((e) => e.condition === String(result))
        .map((e) => e.id);

      this.sendSSE(res, {
        type: 'condition-result',
        timestamp: new Date().toISOString(),
        nodeId,
        edgeIds: activeEdgeIds,
        conditionId: cond.id,
        result,
        detail: `${cond.property} ${cond.operator} ${cond.value ?? ''} => ${result} (actual: ${propValue ?? 'undefined'})`,
      });

      await this.sleep(600);
    }

    // 3. Execute actions whose preconditions are all met
    for (const action of graph.actions) {
      const nodeId = actionNodeMap.get(action.id);
      const allPreconditionsMet = action.preconditions.every(
        (condId) => conditionResults.get(condId) === true,
      );

      if (!allPreconditionsMet) {
        this.sendSSE(res, {
          type: 'action-started',
          timestamp: new Date().toISOString(),
          nodeId,
          actionId: action.id,
          status: 'NOT_ACTIVATED',
          detail: `Preconditions not met for "${action.name}"`,
        });
        await this.sleep(400);
        continue;
      }

      // Send PENDING
      this.sendSSE(res, {
        type: 'action-started',
        timestamp: new Date().toISOString(),
        nodeId,
        actionId: action.id,
        status: 'PENDING',
        detail: `Executing "${action.name}"...`,
      });
      await this.sleep(300);

      // Execute action
      let actionResult: any = null;
      try {
        if (action.httpConfig?.url) {
          actionResult = await this.executeHttpAction(action, entityProps);
        } else if (action.llmPromptTemplate) {
          actionResult = await this.executeLlmAction(action, entityProps);
        } else {
          actionResult = { message: 'No execution configured (simulation only)' };
        }
      } catch (err: any) {
        actionResult = { error: err.message };
      }

      // Send DONE
      this.sendSSE(res, {
        type: 'action-completed',
        timestamp: new Date().toISOString(),
        nodeId,
        actionId: action.id,
        status: 'DONE',
        detail: `"${action.name}" completed`,
        llmResponse:
          typeof actionResult === 'string' ? actionResult : undefined,
        httpResponse:
          typeof actionResult === 'object' ? actionResult : undefined,
      });
      await this.sleep(400);
    }

    // 4. Test complete
    this.sendSSE(res, {
      type: 'test-complete',
      timestamp: new Date().toISOString(),
      detail: 'Test scenario finished',
    });

    res.end();
  }

  // ── Condition Evaluation (safe, no eval()) ───────

  private evaluateCondition(
    operator: ConditionOperator,
    actualValue: string | undefined,
    expectedValue: string | undefined,
  ): boolean {
    if (operator === 'exists') {
      return (
        actualValue !== undefined &&
        actualValue !== null &&
        actualValue !== ''
      );
    }

    if (actualValue === undefined || actualValue === null) return false;

    // Attempt numeric comparison if both values are numbers
    const numActual = Number(actualValue);
    const numExpected = Number(expectedValue);
    const bothNumeric =
      expectedValue !== undefined &&
      expectedValue !== '' &&
      !isNaN(numActual) &&
      !isNaN(numExpected);

    switch (operator) {
      case 'eq':
        return bothNumeric
          ? numActual === numExpected
          : actualValue === expectedValue;
      case 'neq':
        return bothNumeric
          ? numActual !== numExpected
          : actualValue !== expectedValue;
      case 'gt':
        if (!bothNumeric) throw new Error('Non-numeric gt comparison');
        return numActual > numExpected;
      case 'lt':
        if (!bothNumeric) throw new Error('Non-numeric lt comparison');
        return numActual < numExpected;
      case 'gte':
        if (!bothNumeric) throw new Error('Non-numeric gte comparison');
        return numActual >= numExpected;
      case 'lte':
        if (!bothNumeric) throw new Error('Non-numeric lte comparison');
        return numActual <= numExpected;
      case 'contains':
        return actualValue.includes(expectedValue || '');
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private async evaluateConditionWithLlm(
    cond: OntologyCondition,
    properties: Record<string, string>,
  ): Promise<boolean> {
    const prompt = `Given entity properties: ${JSON.stringify(properties)}
Evaluate this condition: "${cond.property} ${cond.operator} ${cond.value}"
Description: ${cond.description}
Respond with ONLY "true" or "false".`;

    const result = await this.llm.generateText({
      tier: 'small',
      prompt,
      maxOutputTokens: 10,
    });
    return result.trim().toLowerCase() === 'true';
  }

  // ── Action Execution ─────────────────────────────

  private async executeHttpAction(
    action: OntologyAction,
    entityProps: Map<string, Record<string, string>>,
  ): Promise<any> {
    const config = action.httpConfig!;
    const url = this.interpolateTemplate(config.url, action, entityProps);
    const method = config.method.toLowerCase();

    const payload = {
      actionId: action.id,
      actionType: action.actionType,
      targetEntityId: action.targetEntityId,
      parameters: action.parameters,
    };

    const response = await axios({
      method,
      url,
      data: payload,
      timeout: 10000,
    });
    return { status: response.status, data: response.data };
  }

  private async executeLlmAction(
    action: OntologyAction,
    entityProps: Map<string, Record<string, string>>,
  ): Promise<string> {
    const prompt = this.interpolateTemplate(
      action.llmPromptTemplate!,
      action,
      entityProps,
    );
    return this.llm.generateText({
      tier: 'regular',
      prompt,
      maxOutputTokens: 512,
    });
  }

  private interpolateTemplate(
    template: string,
    action: OntologyAction,
    entityProps: Map<string, Record<string, string>>,
  ): string {
    let result = template;
    result = result.replace(
      /\{\{targetEntityId\}\}/g,
      action.targetEntityId || '',
    );
    result = result.replace(
      /\{\{actionType\}\}/g,
      action.actionType || '',
    );

    // Replace {{property.name}} with entity property values
    const props = action.targetEntityId
      ? entityProps.get(action.targetEntityId)
      : undefined;
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        result = result.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
          value,
        );
      }
    }

    return result;
  }

  // ── SSE Helpers ──────────────────────────────────

  private sendSSE(res: Response, event: TestScenarioEvent): void {
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch (err: any) {
      this.logger.error(`Failed to send SSE event: ${err.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
