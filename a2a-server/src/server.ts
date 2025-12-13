/**
 * A2A Test Server
 *
 * A simple implementation of the Google Agent-to-Agent protocol for testing.
 * This server exposes a simple agent that can respond to text messages.
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  MessageSendParams,
  Task,
  TaskStatus,
  Message,
  Part,
  TextPart,
} from './types.js';

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

// Agent Card - describes this agent's capabilities
const agentCard: AgentCard = {
  name: 'Echo Agent',
  description: 'A simple test agent that echoes messages and can perform basic text operations like summarization and translation simulation.',
  url: 'http://localhost:5600',
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

/**
 * Serve the agent card at the well-known location
 */
app.get('/.well-known/agent-card.json', (req: Request, res: Response) => {
  console.log('Agent card requested');
  res.json(agentCard);
});

/**
 * Also serve at root for convenience
 */
app.get('/agent-card.json', (req: Request, res: Response) => {
  console.log('Agent card requested (alternate path)');
  res.json(agentCard);
});

/**
 * Process incoming messages and create/update tasks
 */
app.post('/a2a', async (req: Request, res: Response) => {
  try {
    const params: MessageSendParams = req.body;
    console.log('Received A2A message:', JSON.stringify(params, null, 2));

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
    const responseText = generateResponse(inputText);

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
 * Generate a response based on input text
 */
function generateResponse(input: string): string {
  const lowercaseInput = input.toLowerCase();

  // Check for specific commands
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

  // Default echo response
  return `**Echo Agent Response**\n\nI received your message:\n\n> ${input}\n\nAs a test agent running on the A2A protocol, I've successfully processed your request. This demonstrates that the agent-to-agent communication is working correctly.\n\n*Timestamp: ${new Date().toISOString()}*`;
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', agent: agentCard.name, version: agentCard.version });
});

// Start server
const PORT = process.env.PORT || 5600;
app.listen(PORT, () => {
  console.log(`\n🤖 A2A Test Server running on port ${PORT}`);
  console.log(`   Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`   A2A Endpoint: http://localhost:${PORT}/a2a`);
  console.log(`   Health Check: http://localhost:${PORT}/health\n`);
});
