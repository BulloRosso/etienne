/**
 * Tax Items Classification Agent
 *
 * Receives any input data (JSON, text, etc.) and uses LLM to:
 * 1. Parse and recognize expense items
 * 2. Classify each into categories: Staff, Site, Vehicles, or Other
 * 3. Calculate totals for each category
 * 4. Return structured JSON result
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  Task,
  Part,
  TextPart,
  FilePart,
} from '../types.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5600';

export const taxClassificationAgentCard: AgentCard = {
  name: 'Tax Items Classification Agent',
  description: 'Receives any data (JSON, text, CSV, etc.) containing expenses with titles and amounts. Uses AI to recognize, parse, and classify each expense into categories: "Staff", "Site", "Vehicles", or "Other". Returns a structured JSON with categorized expenses and calculated totals. Supports any language.',
  url: `${BASE_URL}/agents/tax-classification`,
  version: '1.0.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  skills: [
    {
      id: 'classify-expenses',
      name: 'Classify Expenses',
      description: 'Parses any input format, classifies expense items into tax categories (Staff, Site, Vehicles, Other), calculates totals for each category, and returns structured JSON.',
      inputModes: ['text', 'file'],
      outputModes: ['text'],
    },
  ],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
};

// Initialize Anthropic client
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

export async function processTaxClassification(parts: Part[]): Promise<Task> {
  const taskId = uuidv4();

  // Extract all input (text and file contents)
  let inputText = '';

  for (const part of parts) {
    if (part.kind === 'text') {
      inputText += (part as TextPart).text + '\n';
    } else if (part.kind === 'file') {
      const filePart = part as FilePart;
      if (filePart.file.bytes) {
        // Decode base64 file content
        const decoded = Buffer.from(filePart.file.bytes, 'base64').toString('utf-8');
        inputText += `\n--- File: ${filePart.file.name || 'unknown'} ---\n${decoded}\n`;
      }
    }
  }

  if (!inputText.trim()) {
    return createErrorTask(taskId, 'No input data provided. Please send expense data in any format (JSON, text, CSV, etc.).');
  }

  try {
    // Use Claude to parse, classify, and structure the entire response
    const result = await classifyWithClaude(inputText);

    // Create successful task response
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
          parts: [{ kind: 'text', text: result }],
        },
      },
      artifacts: [
        {
          artifactId: uuidv4(),
          name: 'classification-result.json',
          parts: [
            { kind: 'text', text: result },
          ],
        },
      ],
    };

    return task;
  } catch (error) {
    console.error('Tax classification error:', error);
    return createErrorTask(
      taskId,
      `Failed to classify expenses: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function classifyWithClaude(inputData: string): Promise<string> {
  const client = getAnthropicClient();

  const prompt = `You are a multilingual tax expense classifier. You will receive input data in ANY format (JSON, text, CSV, markdown table, etc.) and in ANY language.

Your task:
1. Parse and recognize all expense items from the input (each item should have some kind of title/description and an amount)
2. Classify each expense into exactly ONE of these categories:
   - Staff: Expenses related to employees, salaries, wages, benefits, training, recruitment, HR
   - Site: Expenses related to office, rent, utilities, maintenance, supplies, warehouse, facilities
   - Vehicles: Expenses related to cars, trucks, fuel, diesel, vehicle maintenance, parking, transportation
   - Other: Any expenses that don't fit the above categories
3. Calculate the total for each category (sum of amounts)
4. Calculate the grand total

Return ONLY a valid JSON object in this exact format (no markdown, no explanation, just pure JSON):
{
  "Staff": {
    "items": [{"title": "...", "amount": 123.45}, ...],
    "total": 123.45
  },
  "Site": {
    "items": [{"title": "...", "amount": 123.45}, ...],
    "total": 123.45
  },
  "Vehicles": {
    "items": [{"title": "...", "amount": 123.45}, ...],
    "total": 123.45
  },
  "Other": {
    "items": [{"title": "...", "amount": 123.45}, ...],
    "total": 123.45
  },
  "grandTotal": 123.45
}

Important:
- All amounts must be numbers (not strings)
- Totals must be calculated correctly as the sum of item amounts in each category
- If a category has no items, use an empty array and total of 0
- Preserve the original title/description text from the input
- If you cannot find any expense items, return an error message in JSON format: {"error": "No expense items found in the input"}

Here is the input data to process:

${inputData}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Extract the response
  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Try to extract JSON from the response (in case there's any extra text)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return a valid JSON response');
  }

  // Validate it's valid JSON
  const parsed = JSON.parse(jsonMatch[0]);

  // Return formatted JSON
  return JSON.stringify(parsed, null, 2);
}

function createErrorTask(taskId: string, errorMessage: string): Task {
  return {
    kind: 'task',
    id: taskId,
    status: {
      state: 'failed',
      timestamp: new Date().toISOString(),
      message: {
        messageId: uuidv4(),
        role: 'agent',
        kind: 'message',
        parts: [{ kind: 'text', text: errorMessage }],
      },
    },
  };
}
