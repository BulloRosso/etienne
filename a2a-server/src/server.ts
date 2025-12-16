/**
 * A2A Test Server
 *
 * A multi-agent implementation of the Google Agent-to-Agent protocol.
 * Hosts multiple agents with individual well-known endpoints and a directory.
 */

// OpenTelemetry instrumentation MUST be imported first
import './instrumentation.js';

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  MessageSendParams,
  Task,
  TextPart,
  DirectoryEntry,
  DirectoryResponse,
  A2AMetadata,
} from './types.js';
import {
  extractTraceContext,
  startAgentSpan,
  SpanStatusCode,
  isOtelEnabled,
  context as otelContext,
  tracer,
} from './instrumentation.js';
import { trace } from '@opentelemetry/api';
import { imageMergerAgentCard, processImageMerger } from './agents/image-merger.agent.js';
import { taxClassificationAgentCard, processTaxClassification } from './agents/tax-classification.agent.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = process.env.PORT || 5600;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Update agent cards with correct URLs
const updateAgentCardUrl = (card: AgentCard, agentPath: string): AgentCard => ({
  ...card,
  url: `${BASE_URL}${agentPath}`,
});

// Agent registry
const agents: Map<string, { card: AgentCard; processor: (parts: any[]) => Promise<Task> }> = new Map();

// Register Image Merger Agent
agents.set('image-merger', {
  card: updateAgentCardUrl(imageMergerAgentCard, '/agents/image-merger'),
  processor: processImageMerger,
});

// Register Tax Classification Agent
agents.set('tax-classification', {
  card: updateAgentCardUrl(taxClassificationAgentCard, '/agents/tax-classification'),
  processor: processTaxClassification,
});

// Legacy Echo Agent Card (for backward compatibility)
const echoAgentCard: AgentCard = {
  name: 'Echo Agent',
  description: 'A simple test agent that echoes messages and can perform basic text operations like summarization and translation simulation.',
  url: `${BASE_URL}`,
  version: '1.0.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  skills: [
    {
      id: 'echo',
      name: 'Echo',
      description: 'Echoes back the received message with a friendly greeting',
      inputModes: ['text'],
      outputModes: ['text'],
    },
    {
      id: 'summarize',
      name: 'Summarize',
      description: 'Provides a mock summary of the input text',
      inputModes: ['text'],
      outputModes: ['text'],
    },
    {
      id: 'analyze',
      name: 'Analyze',
      description: 'Analyzes text and provides basic statistics',
      inputModes: ['text'],
      outputModes: ['text'],
    },
  ],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
};

// Store for active tasks (in-memory for testing)
const tasks = new Map<string, Task>();

// ============================================================================
// DIRECTORY ENDPOINT
// ============================================================================

/**
 * Directory endpoint - lists all available agents
 * Returns agent cards in a format compatible with A2A registries
 */
app.get('/directory', (req: Request, res: Response) => {
  console.log('Directory requested');

  // Return flat array of agent cards for compatibility with standard A2A registries
  const agentCards: AgentCard[] = [];

  for (const [agentId, agent] of agents.entries()) {
    agentCards.push(agent.card);
  }

  // Return in standard registry format (array of agent cards in 'agents' property)
  res.json({
    agents: agentCards,
    serverVersion: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// WELL-KNOWN ENDPOINTS
// ============================================================================

/**
 * Well-known endpoint for Image Merger Agent
 */
app.get('/.well-known/agent-card-image-merger.json', (req: Request, res: Response) => {
  console.log('Image Merger agent card requested');
  const agent = agents.get('image-merger');
  if (agent) {
    res.json(agent.card);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

/**
 * Well-known endpoint for Tax Classification Agent
 */
app.get('/.well-known/agent-card-tax-classification.json', (req: Request, res: Response) => {
  console.log('Tax Classification agent card requested');
  const agent = agents.get('tax-classification');
  if (agent) {
    res.json(agent.card);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

/**
 * Generic well-known endpoint (returns legacy Echo Agent for backward compatibility)
 */
app.get('/.well-known/agent-card.json', (req: Request, res: Response) => {
  console.log('Default agent card requested');
  res.json(echoAgentCard);
});

/**
 * Agent-specific card endpoint (alternative path)
 */
app.get('/agents/:agentId/agent-card.json', (req: Request, res: Response) => {
  const { agentId } = req.params;
  console.log(`Agent card requested for: ${agentId}`);

  const agent = agents.get(agentId);
  if (agent) {
    res.json(agent.card);
  } else {
    res.status(404).json({ error: `Agent '${agentId}' not found` });
  }
});

// ============================================================================
// A2A ENDPOINTS FOR INDIVIDUAL AGENTS
// ============================================================================

/**
 * A2A endpoint for Image Merger Agent
 */
app.post('/agents/image-merger/a2a', async (req: Request, res: Response) => {
  await handleAgentRequest('image-merger', req, res);
});

/**
 * A2A endpoint for Tax Classification Agent
 */
app.post('/agents/tax-classification/a2a', async (req: Request, res: Response) => {
  await handleAgentRequest('tax-classification', req, res);
});

/**
 * Generic agent A2A handler
 */
async function handleAgentRequest(agentId: string, req: Request, res: Response) {
  const params: MessageSendParams = req.body;

  // Extract trace context from A2A metadata (per A2A spec)
  const parentContext = extractTraceContext(params.metadata);
  const span = startAgentSpan(agentId, 'process', parentContext);

  try {
    console.log(`Received A2A message for ${agentId}:`, JSON.stringify(params, null, 2));

    const agent = agents.get(agentId);
    if (!agent) {
      span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Agent not found' });
      span?.end();
      return res.status(404).json({
        error: {
          code: 404,
          message: `Agent '${agentId}' not found`,
        },
      });
    }

    if (!params.message || !params.message.parts) {
      span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid request' });
      span?.end();
      return res.status(400).json({
        error: {
          code: 400,
          message: 'Invalid request: message and parts are required',
        },
      });
    }

    // Add agent info to span
    span?.setAttribute('a2a.agent.card.name', agent.card.name);
    span?.setAttribute('a2a.message.parts.count', params.message.parts.length);

    // Process with the agent's processor (within the trace context)
    // We need to set the span as active so child spans (like LLM calls) are properly linked
    const activeContext = span
      ? trace.setSpan(parentContext, span)
      : parentContext;

    const task = await otelContext.with(
      activeContext,
      () => agent.processor(params.message.parts)
    );

    // Add task info to span
    span?.setAttribute('a2a.task.id', task.id);
    span?.setAttribute('a2a.task.status', task.status.state);

    // Store task
    tasks.set(task.id, task);

    // If blocking mode, return the completed task
    if (params.configuration?.blocking) {
      console.log(`Returning completed task for ${agentId}:`, task.id);
      span?.setStatus({ code: SpanStatusCode.OK });
      span?.end();
      return res.json({ result: task });
    }

    // Otherwise return task in submitted state (but we process synchronously)
    const submittedTask: Task = {
      ...task,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
    };

    span?.setStatus({ code: SpanStatusCode.OK });
    span?.end();
    return res.json({ result: submittedTask });
  } catch (error) {
    console.error(`Error processing ${agentId} request:`, error);
    span?.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
    });
    span?.recordException(error instanceof Error ? error : new Error(String(error)));
    span?.end();
    return res.status(500).json({
      error: {
        code: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    });
  }
}

// ============================================================================
// LEGACY ECHO AGENT ENDPOINTS (backward compatibility)
// ============================================================================

/**
 * Also serve at root for convenience (legacy)
 */
app.get('/agent-card.json', (req: Request, res: Response) => {
  console.log('Agent card requested (alternate path)');
  res.json(echoAgentCard);
});

/**
 * Legacy A2A endpoint (Echo Agent)
 */
app.post('/a2a', async (req: Request, res: Response) => {
  try {
    const params: MessageSendParams = req.body;
    console.log('Received A2A message (legacy):', JSON.stringify(params, null, 2));

    if (!params.message || !params.message.parts) {
      return res.status(400).json({
        error: {
          code: 400,
          message: 'Invalid request: message and parts are required',
        },
      });
    }

    // Extract text from the message
    const textParts = params.message.parts.filter(
      (p): p is TextPart => p.kind === 'text'
    );
    const inputText = textParts.map(p => p.text).join('\n');

    // Generate response based on content
    const responseText = generateEchoResponse(inputText);

    // Create task
    const taskId = uuidv4();
    const task: Task = {
      kind: 'task',
      id: taskId,
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
        message: {
          messageId: uuidv4(),
          role: 'agent',
          kind: 'message',
          parts: [{ kind: 'text', text: responseText }],
        },
      },
      artifacts: [
        {
          artifactId: uuidv4(),
          name: 'response',
          parts: [{ kind: 'text', text: responseText }],
        },
      ],
    };

    tasks.set(taskId, task);

    // If blocking mode, return the completed task
    if (params.configuration?.blocking) {
      console.log('Returning completed task:', taskId);
      return res.json({ result: task });
    }

    // Otherwise return task in submitted state
    const submittedTask: Task = {
      ...task,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
    };

    return res.json({ result: submittedTask });
  } catch (error) {
    console.error('Error processing A2A request:', error);
    return res.status(500).json({
      error: {
        code: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    });
  }
});

/**
 * Get task status
 */
app.get('/a2a/tasks/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({
      error: {
        code: 404,
        message: `Task ${taskId} not found`,
      },
    });
  }

  return res.json({ result: task });
});

/**
 * Generate a response for the legacy Echo Agent
 */
function generateEchoResponse(input: string): string {
  const lowercaseInput = input.toLowerCase();

  if (lowercaseInput.includes('summarize')) {
    return `**Summary Request Processed**\n\nYou asked me to summarize the following:\n\n"${input}"\n\nAs a test agent, I'll provide a mock summary: This appears to be a request for text summarization. The content discusses various topics and would benefit from condensation into key points.\n\n*This is a test response from the Echo Agent.*`;
  }

  if (lowercaseInput.includes('analyze')) {
    const wordCount = input.split(/\s+/).length;
    const charCount = input.length;
    const sentenceCount = (input.match(/[.!?]+/g) || []).length || 1;

    return `**Text Analysis Results**\n\n- Word count: ${wordCount}\n- Character count: ${charCount}\n- Approximate sentences: ${sentenceCount}\n- Average words per sentence: ${Math.round(wordCount / sentenceCount)}\n\n*Analysis provided by Echo Agent.*`;
  }

  if (lowercaseInput.includes('hello') || lowercaseInput.includes('hi ') || lowercaseInput.startsWith('hi')) {
    return `Hello! I'm the Echo Agent, a test A2A server. I received your greeting and I'm happy to help demonstrate the A2A protocol. How can I assist you today?`;
  }

  return `**Echo Agent Response**\n\nI received your message:\n\n> ${input}\n\nAs a test agent running on the A2A protocol, I've successfully processed your request. This demonstrates that the agent-to-agent communication is working correctly.\n\n*Timestamp: ${new Date().toISOString()}*`;
}

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    agents: Array.from(agents.keys()),
    version: '1.0.0',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🤖 A2A Multi-Agent Server running on port ${PORT}`);
  console.log(`\n📋 Directory: ${BASE_URL}/directory`);
  console.log(`\n🎭 Available Agents:`);

  for (const [agentId, agent] of agents.entries()) {
    console.log(`   - ${agent.card.name}`);
    console.log(`     Well-known: ${BASE_URL}/.well-known/agent-card-${agentId}.json`);
    console.log(`     A2A Endpoint: ${BASE_URL}/agents/${agentId}/a2a`);
  }

  console.log(`\n📡 Legacy Endpoints:`);
  console.log(`   Agent Card: ${BASE_URL}/.well-known/agent-card.json`);
  console.log(`   A2A Endpoint: ${BASE_URL}/a2a`);
  console.log(`   Health Check: ${BASE_URL}/health\n`);
});
