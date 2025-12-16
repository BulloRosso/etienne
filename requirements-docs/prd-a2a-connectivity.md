# A2A Connectivity (Google Agent to Agent Protocol)

I want to demonstrate how we can interact with external agents using the A2A protocol. For this reason we will set up a A2A server on port 5600 and use it with an A2A client to pass tasks to this external agent.

These are the core steps for this task:

1. Implement the A2A server using the @a2a-js/sdk
2. Implement a new service backend/src/a2a-client which can pass tasks to an selected external agent
3. Wrap the a2a-client as MCP tool and add this tool to our existing mcp server implementation
4. Implement a new REact Component a2a-settings.jsx in the frontend which allows us to connect to an a2a agent registry and select one or more agents
5. Insert a2a-settings.jsx in the preview pane tab content of "Connectivity": Introduce a top level tab strip with "MCP Protocol" (default tab) and "A2A Protocol" which displays a2a-settings.jsx in the content area
6. Implement a new service backend/src/a2a-settings which remembers the settings of a2a-settings.jsx in a file <workspace>/<project name>/.etienne/a2a-settings.json and provides GET and POST endpoints for the frontend. Basically this file is an array of "AgentCards" which directly stored the external agent(s) cards we received via the A2A protocol.
7. Inside the reasoning process of our agent it will call the MCP tool automatically

## Frontend
Extend the "Connectivity" content area with a new tab "A2A protocol" and read and save data to the a2a-settings backend service using API calls. The user can select or deselect agents from the catalog.

Make sure we display the agent card with only the essential details but remember the whole agent card data in our settings internally. Use icons and explanations to illustrate the agent's properties.

The user can enter the url of an a2a registry and then press a "Connect" button to see the list of agents. We provide a frontend filter button if there are more than 3 agents returned. The user can enter a string and me match it with a case-insensitive "contains" to the each agent card. 

We use the default "https://www.a2aregistry.org/registry.json" as a2a registry url

## Test Server
We need a test server in a new directory /a2a-server which is build with @a2a-js/sdk and runs on port :5600

Create a new start-a2aserver.sh in the /start-scripts directory

## Backend
We have these new services:

### a2a-client
Implement a new service backend/src/a2a-client which can pass tasks to an selected external agent.

Example code:
```
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';
import { A2AClient, SendMessageSuccessResponse } from '@a2a-js/sdk/client';
import { 
  MessageSendParams, 
  Task, 
  Message, 
  Part,
  FilePart 
} from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Helper to convert file to base64 FilePart
function createFilePart(filePath: string): Part {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Content = fileBuffer.toString('base64');
  const fileName = path.basename(filePath);
  const mimeType = getMimeType(fileName);

  return {
    kind: 'file',
    file: {
      bytes: base64Content,
      name: fileName,
      mimeType: mimeType,
    },
  };
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Extract file from artifact
function extractFileFromArtifact(task: Task, outputDir: string): string | null {
  if (!task.artifacts || task.artifacts.length === 0) {
    console.log('No artifacts found in task');
    return null;
  }

  for (const artifact of task.artifacts) {
    for (const part of artifact.parts) {
      if (part.kind === 'file') {
        const filePart = part as FilePart;
        const fileName = filePart.file.name || `output_${artifact.artifactId}`;
        const outputPath = path.join(outputDir, fileName);

        if ('bytes' in filePart.file && filePart.file.bytes) {
          // File is inline as base64
          const buffer = Buffer.from(filePart.file.bytes, 'base64');
          fs.writeFileSync(outputPath, buffer);
          console.log(`File saved to: ${outputPath}`);
          return outputPath;
        } else if ('uri' in filePart.file && filePart.file.uri) {
          // File is referenced by URI - you'd need to fetch it
          console.log(`File available at URI: ${filePart.file.uri}`);
          return filePart.file.uri;
        }
      }
    }
  }
  return null;
}

// Main function to collaborate with external A2A agent
async function collaborateWithExternalAgent(
  agentCardUrl: string,
  file1Path: string,
  file2Path: string,
  prompt: string,
  outputDir: string = './output'
): Promise<string | null> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Create A2A client from the external agent's card URL
  console.log(`Connecting to external agent at: ${agentCardUrl}`);
  const client = await A2AClient.fromCardUrl(agentCardUrl);

  // 2. Create file parts for both files
  const filePart1 = createFilePart(file1Path);
  const filePart2 = createFilePart(file2Path);

  // 3. Create the message with files and prompt
  const sendParams: MessageSendParams = {
    message: {
      messageId: uuidv4(),
      role: 'user',
      kind: 'message',
      parts: [
        { kind: 'text', text: prompt },
        filePart1,
        filePart2,
      ],
    },
    configuration: {
      blocking: true, // Wait for completion
      acceptedOutputModes: ['text', 'file'],
    },
  };

  console.log('Sending files and prompt to external agent...');

  // 4. Send the message and wait for response
  const response = await client.sendMessage(sendParams);

  if ('error' in response) {
    console.error('Error from external agent:', response.error);
    throw new Error(response.error.message);
  }

  const result = (response as SendMessageSuccessResponse).result;

  // 5. Handle the response
  if (result.kind === 'task') {
    const task = result as Task;
    console.log(`Task ${task.id} completed with status: ${task.status.state}`);

    if (task.status.state === 'completed') {
      // Extract the output file from artifacts
      return extractFileFromArtifact(task, outputDir);
    } else {
      console.error(`Task ended with status: ${task.status.state}`);
      return null;
    }
  } else {
    // Direct message response (no task/artifacts)
    const message = result as Message;
    console.log('Received direct message response');
    
    // Check if message contains a file
    for (const part of message.parts) {
      if (part.kind === 'file') {
        const filePart = part as FilePart;
        if ('bytes' in filePart.file && filePart.file.bytes) {
          const fileName = filePart.file.name || 'output_file';
          const outputPath = path.join(outputDir, fileName);
          const buffer = Buffer.from(filePart.file.bytes, 'base64');
          fs.writeFileSync(outputPath, buffer);
          return outputPath;
        }
      }
    }
    return null;
  }
}

// Alternative: Using streaming for long-running tasks
async function collaborateWithExternalAgentStreaming(
  agentCardUrl: string,
  file1Path: string,
  file2Path: string,
  prompt: string,
  outputDir: string = './output'
): Promise<string | null> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const client = await A2AClient.fromCardUrl(agentCardUrl);

  const filePart1 = createFilePart(file1Path);
  const filePart2 = createFilePart(file2Path);

  const sendParams: MessageSendParams = {
    message: {
      messageId: uuidv4(),
      role: 'user',
      kind: 'message',
      parts: [
        { kind: 'text', text: prompt },
        filePart1,
        filePart2,
      ],
    },
  };

  console.log('Sending files via streaming...');

  let finalTask: Task | null = null;

  // Use streaming to get real-time updates
  const stream = client.sendMessageStream(sendParams);

  for await (const event of stream) {
    switch (event.kind) {
      case 'task':
        console.log(`Task created: ${event.id}, status: ${event.status.state}`);
        finalTask = event as Task;
        break;
      case 'status-update':
        console.log(`Status update: ${event.status.state}`);
        if (event.final && finalTask) {
          finalTask.status = event.status;
        }
        break;
      case 'artifact-update':
        console.log(`Artifact received: ${event.artifact.artifactId}`);
        if (finalTask) {
          if (!finalTask.artifacts) finalTask.artifacts = [];
          finalTask.artifacts.push(event.artifact);
        }
        break;
    }
  }

  if (finalTask && finalTask.status.state === 'completed') {
    return extractFileFromArtifact(finalTask, outputDir);
  }

  return null;
}

// Example usage within a Claude Agent SDK workflow
async function runClaudeAgentWithA2A() {
  // This shows how you might orchestrate the A2A call
  // as part of a larger Claude Agent workflow
  
  const externalAgentUrl = 'https://partner-company.com/.well-known/agent-card.json';
  const file1 = './data/input1.pdf';
  const file2 = './data/input2.csv';
  const prompt = 'Please analyze these two files and generate a summary report combining the data from both.';
  
  try {
    const outputFile = await collaborateWithExternalAgent(
      externalAgentUrl,
      file1,
      file2,
      prompt,
      './workspace/output'
    );

    if (outputFile) {
      console.log(`Successfully received output file: ${outputFile}`);
      
      // Now you can use the output file in your Claude Agent workflow
      // For example, continue processing with Claude Agent SDK:
      for await (const message of query({
        prompt: `I've received a file from an external agent at ${outputFile}. Please read and summarize its contents.`,
        options: {
          allowedTools: ['Read', 'Glob'],
        } as ClaudeAgentOptions,
      })) {
        console.log(message);
      }
    }
  } catch (error) {
    console.error('Failed to collaborate with external agent:', error);
  }
}

// Export for use in your application
export {
  collaborateWithExternalAgent,
  collaborateWithExternalAgentStreaming,
  createFilePart,
  extractFileFromArtifact,
};
```
Usage example:
```
// main.ts
import { collaborateWithExternalAgent } from './a2a-collaboration';

async function main() {
  const result = await collaborateWithExternalAgent(
    'https://external-partner.com/.well-known/agent-card.json',
    './files/document1.pdf',
    './files/spreadsheet.xlsx',
    'Merge the data from the PDF and spreadsheet into a single analysis report.',
    './output'
  );

  if (result) {
    console.log(`Output file saved to: ${result}`);
  }
}

main();
```

#### Test
Create a test file backend/src/a2a-client/tests which tests the connectivity to our test server at port :5600.

Example code:
```
// test-a2a-connection.ts
import { A2AClient } from '@a2a-js/sdk/client';
import { MessageSendParams } from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';

async function testA2AConnection() {
  // Pick one of the public agents
  const agentCardUrl = 'https://hello.a2aregistry.org/.well-known/agent-card.json';
  
  try {
    console.log(`Connecting to: ${agentCardUrl}`);
    const client = await A2AClient.fromCardUrl(agentCardUrl);
    
    console.log('Connected! Sending test message...');
    
    const params: MessageSendParams = {
      message: {
        messageId: uuidv4(),
        role: 'user',
        kind: 'message',
        parts: [{ kind: 'text', text: 'Hello! Can you greet me?' }],
      },
      configuration: {
        blocking: true,
      },
    };
    
    const response = await client.sendMessage(params);
    
    if ('error' in response) {
      console.error('Error:', response.error);
    } else {
      console.log('Response:', JSON.stringify(response.result, null, 2));
    }
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

testA2AConnection();
```

### MCP wrapper for our a2a-client
The Claude Agent SDK supports MCP (Model Context Protocol) tools natively. We will reate an MCP tool that wraps the A2A client, allowing Claude to invoke external A2A agents as tools.

**Important**: The selected external agents in our a2a-settings must be reported by the MCP tool as one tool per agent!
So our agent has an exact overview which agent has which capabilities. We map the A2A response to several MCP tool signatures.

Intended behaviour when our MCP server receives a list tools request it will return resolve the a2a-settings dynamicalla and return the existing tools + each of the external agents methods from the a2a-settings wrapped as "a2a_method(...)". 

In the tool "a2a_client.ts" we implement only one method "a2a_method(<agent name or id>,<agent method>,<agent method params>) which dynamically routes to our client implementation.

Example
```
// a2a-mcp-tool.ts
import { tool, createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { MessageSendParams, Task, Message, FilePart } from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Define the MCP tool for A2A collaboration
const collaborateWithA2AAgent = tool(
  'collaborate_with_a2a_agent',
  'Send a request to an external A2A agent with optional files and receive the result. Use this when you need to delegate work to a specialized external agent.',
  {
    agentCardUrl: z.string().describe('The URL to the A2A agent card (e.g., https://example.com/.well-known/agent-card.json)'),
    prompt: z.string().describe('The instruction/prompt to send to the external agent'),
    filePaths: z.array(z.string()).optional().describe('Optional array of local file paths to send to the agent'),
  },
  async ({ agentCardUrl, prompt, filePaths }) => {
    try {
      // Connect to the A2A agent
      const client = await A2AClient.fromCardUrl(agentCardUrl);

      // Build message parts
      const parts: any[] = [{ kind: 'text', text: prompt }];

      // Add files if provided
      if (filePaths && filePaths.length > 0) {
        for (const filePath of filePaths) {
          if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const base64Content = fileBuffer.toString('base64');
            const fileName = path.basename(filePath);
            const mimeType = getMimeType(fileName);

            parts.push({
              kind: 'file',
              file: {
                bytes: base64Content,
                name: fileName,
                mimeType: mimeType,
              },
            });
          }
        }
      }

      // Send the message
      const params: MessageSendParams = {
        message: {
          messageId: uuidv4(),
          role: 'user',
          kind: 'message',
          parts,
        },
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text', 'file'],
        },
      };

      const response = await client.sendMessage(params);

      if ('error' in response) {
        return {
          content: [{ type: 'text', text: `Error from A2A agent: ${response.error.message}` }],
          isError: true,
        };
      }

      // Process the result
      const result = response.result;
      const outputParts: any[] = [];

      if (result.kind === 'task') {
        const task = result as Task;
        outputParts.push({ 
          type: 'text', 
          text: `Task ${task.id} completed with status: ${task.status.state}` 
        });

        // Extract artifacts
        if (task.artifacts) {
          for (const artifact of task.artifacts) {
            for (const part of artifact.parts) {
              if (part.kind === 'text') {
                outputParts.push({ type: 'text', text: part.text });
              } else if (part.kind === 'file') {
                const filePart = part as FilePart;
                if ('bytes' in filePart.file && filePart.file.bytes) {
                  // Save the file locally
                  const outputDir = './a2a-output';
                  if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                  }
                  const outputPath = path.join(outputDir, filePart.file.name || 'output_file');
                  fs.writeFileSync(outputPath, Buffer.from(filePart.file.bytes, 'base64'));
                  outputParts.push({ 
                    type: 'text', 
                    text: `File saved to: ${outputPath}` 
                  });
                } else if ('uri' in filePart.file) {
                  outputParts.push({ 
                    type: 'text', 
                    text: `File available at: ${filePart.file.uri}` 
                  });
                }
              }
            }
          }
        }
      } else {
        // Direct message response
        const message = result as Message;
        for (const part of message.parts) {
          if (part.kind === 'text') {
            outputParts.push({ type: 'text', text: part.text });
          }
        }
      }

      return { content: outputParts };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to communicate with A2A agent: ${error}` }],
        isError: true,
      };
    }
  }
);

// Helper function
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Create the MCP server with the A2A tool
const a2aMcpServer = createSdkMcpServer({
  name: 'a2a-collaboration-server',
  version: '1.0.0',
  tools: [collaborateWithA2AAgent],
});

// Export for use
export { a2aMcpServer, collaborateWithA2AAgent };
```

### a2a-settings
Implement a new service backend/src/a2a-settings which remembers the settings of a2a-settings.jsx in a file <workspace>/<project name>/.etienne/a2a-settings.json and provides GET and POST endpoints for the frontend. Basically this file is an array of "AgentCards" which directly stored the external agent(s) cards we received via the A2A protocol.

# Summary: Architecture
Key Points

* MCP is the bridge - The Claude Agent SDK uses MCP to extend its capabilities with custom tools
* A2A client lives inside the MCP tool - When Claude decides to use the tool, it invokes the A2A client
* Claude decides when to hand over - Based on your prompt and the tool description, Claude autonomously decides when to call the external A2A agent
* Files are handled transparently - The MCP tool reads local files, converts to base64, sends via A2A, and saves returned files locally