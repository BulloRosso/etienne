# Output guardrails after Claude delivered a result

We need to implement a new backend/src/output-guardrails service and controller which will call a LLM after the claude code response was received. This will be done by calling "await checkGuardrail(<user message>) => [violations]".

We will emit SSE events like with Hooks & Events feature to enable the frontend showing the violations found. The user message is replaced before sent back to the client. 

**Important**
--------- 
This means when the post-processing is enabled we loose the model response streaming functionality:
1. we will buffer the complete output in the backend, 
2. then apply the guardrail and 
3. replace the content which will be returned to the frontend + emit the violation event(s)
4. then send the final response to the user. 
If post-processing is disabled (which it is by default), then we need to keep the flow exactly like it is now.
---------

## Frontend
Introduce a tab strip with the items "Pre-processing" and "Post-processing" to GuardrailsSettings.jsx before the text "Select which types of sensitive...".

The current tab content is for pre-processing, for post-processing we ad a light-themed Monaco editor showing the prompt.
Above the editor are:
* Infotext: "Select which types of sensitive information should be automatically detected and redacted from model output after it is returned from the AI model. Using this feature turns off response streaming."
* a checkbox "Enable postprocessing" which the user can check to enable the post-processing guardrail in the backend.

We wil extend/reuse the existing GuardrailsWarningMessage  in StructuredMessage.jsx.

## Backend
We expose an API endpoint GET, POST api/guardrails/:project/output which uses an object like 
{
   "enabled": true,
   "prompt": <guardrail prompt>
   "violationsEnum": ["Color","City"]
}
Violations is the class of violation which is returned in the event to the frontend. The frontend then can apply different icons to the violation class.

The configuration is stored in a project file workflows/<project>/.etienne/output-guardrails.json.

## Example implementation
```
import OpenAI from 'openai';

// Types
interface GuardrailResponse {
  guardrailTriggered: boolean;
  modifiedContent: string;
  runtimeMilliseconds: number;
  violations: string[];
}

interface GuardrailConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
}

// Initialize OpenAI client
let openaiClient: OpenAI;

/**
 * Initialize the guardrail module with OpenAI API key
 */
export function initializeGuardrail(config: GuardrailConfig): void {
  openaiClient = new OpenAI({
    apiKey: config.apiKey,
  });
}

/**
 * Main guardrail function - inspects content for violations
 * @param content - The LLM output to inspect
 * @returns GuardrailResponse with violation details and modified content
 */
export async function checkGuardrail(content: string): Promise<GuardrailResponse> {
  const startTime = Date.now();

  if (!openaiClient) {
    throw new Error('Guardrail not initialized. Call initializeGuardrail() first.');
  }

  const systemPrompt = `You are a content moderation guardrail system. Your job is to detect policy violations in text content.

POLICY RULES:
1. Detect any mentions of COLORS (e.g., red, blue, green, yellow, purple, orange, pink, black, white, gray, etc.)
2. Detect any mentions of CITIES (e.g., New York, London, Tokyo, Paris, Berlin, etc.)

INSTRUCTIONS:
- Carefully scan the input text for any color names or city names
- List ALL violations found (each color or city mentioned)
- Create modified content where each violation is replaced with "xxxxxx"
- If no violations found, return the original content unchanged
- Be thorough - catch all variations (e.g., "NYC" is New York City)

Return your analysis as JSON with these fields:
- guardrailTriggered: boolean (true if any violations found)
- violations: array of strings (list each color/city found, e.g., ["red", "Paris"])
- modifiedContent: string (original text with violations replaced by "xxxxxx")`;

  const userPrompt = `Analyze this content for policy violations:\n\n${content}`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'guardrail_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              guardrailTriggered: {
                type: 'boolean',
                description: 'Whether any policy violations were detected',
              },
              violations: {
                type: 'array',
                description: 'List of detected violations (colors or cities)',
                items: {
                  type: 'string',
                },
              },
              modifiedContent: {
                type: 'string',
                description: 'Content with violations replaced by xxxxxx',
              },
            },
            required: ['guardrailTriggered', 'violations', 'modifiedContent'],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(
      response.choices[0].message.content || '{}'
    );

    const runtimeMilliseconds = Date.now() - startTime;

    return {
      guardrailTriggered: result.guardrailTriggered,
      modifiedContent: result.modifiedContent,
      runtimeMilliseconds,
      violations: result.violations,
    };
  } catch (error) {
    const runtimeMilliseconds = Date.now() - startTime;
    
    console.error('Guardrail check failed:', error);
    
    // Fail-safe: return original content if guardrail fails
    return {
      guardrailTriggered: false,
      modifiedContent: content,
      runtimeMilliseconds,
      violations: [],
    };
  }
}



// Example usage
/*
import { initializeGuardrail, checkGuardrail } from './guardrail';

// Initialize once at startup
initializeGuardrail({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Use in your application
const llmOutput = "I love the red sunset in Paris, it's beautiful!";
const result = await checkGuardrail(llmOutput);

console.log(result);
// Output:
// {
//   guardrailTriggered: true,
//   modifiedContent: "I love the xxxxxx sunset in xxxxxx, it's beautiful!",
//   runtimeMilliseconds: 847,
//   violations: ["red", "Paris"]
// }
*/
```