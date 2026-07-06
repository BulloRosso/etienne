import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from '../graph/tt-repository';
import { AgentRun } from '../types/tendertrace-types';

/**
 * agent_runs audit (spec §3.4/§7): every pipeline run records session, prompt
 * version + content hash, model, token usage and outcome in the audit graph —
 * the audit trail is itself part of the claim evidence story.
 */
@Injectable()
export class RunRegistryService {
  private readonly logger = new Logger(RunRegistryService.name);

  constructor(private readonly repository: TtRepository) {}

  async start(
    project: string,
    input: { pipeline: string; promptVersion: string; promptHash?: string; model: string },
  ): Promise<AgentRun> {
    const id = await this.repository.nextKey(project, 'agentRun', 'AR-', 4);
    const run: AgentRun = {
      id,
      pipeline: input.pipeline,
      promptVersion: input.promptVersion,
      promptHash: input.promptHash,
      model: input.model,
      tokensIn: 0,
      tokensOut: 0,
      startedAt: new Date().toISOString(),
    };
    await this.repository.saveAgentRun(project, run);
    return run;
  }

  async finish(
    project: string,
    run: AgentRun,
    outcome: string,
    extras: Partial<AgentRun> = {},
  ): Promise<void> {
    await this.repository.saveAgentRun(project, {
      ...run,
      ...extras,
      outcome,
      finishedAt: new Date().toISOString(),
    });
  }

  async list(project: string, pipeline?: string): Promise<AgentRun[]> {
    return this.repository.listAgentRuns(project, pipeline);
  }
}
