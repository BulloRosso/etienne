# Deep Research

We want to be able to create deep research reports in markdown format.

A report has the file extension ".research"

The user must provide a research brief document in markdown file and start with the model

**Research Brief** is a markdown file is the prompt passed to the deep research model as input.

## Frontend

### Preview Handler
We want the preview handler to recognize .research as new extension and open the markdownviewer.

### Component ResearchDocument
We need a new React component ResearchDocument which is called with
* a parameter: "input" which is a filename relative to the active workspace project, e. g. "research/research-brief.md"
* a parameter: "output" which is a filename relative to the active workspace project, e. g. "docs/results.research".

#### If the "output" file does NOT exist
Displpay a circular progress indicator and "Research for <input filename without path> in Progress" text.
Below is a list of events received via the existing event bus of the frontend. The display should be similar to StructuredMessage.jsx.

Every 3 seconds we must check whether the filname exists in the workspace.

#### If the "output" file does exist
Render markdown (like markdownviewer - copy from there).

## Backend
In the Backend in backend/src/deep-research we want to create a new service which uses the OpenAI o3-deep-research model.

We want to publish the events returned by OpenAI as events of type "Research.<subtype>" over the existing Server Side Events bus.

The event should contain the input file name, so we can have more than one researches at the same time.

Use the Responses API with stream: true and iterate the SSE event stream. In Node.js (official openai SDK), handle response.output_text.delta for incremental text and response.completed to finalize.

```
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  const stream = await client.responses.stream({
    model: "o3-deep-research",
    input: "Research whether sodium-ion EV packs will reach <$60/kWh by 2027. Cite sources.",
    stream: true
  });

  for await (const event of stream) {
    switch (event.type) {
      case "response.output_text.delta":
        process.stdout.write(event.delta);           // incremental tokens
        break;
      case "response.output_text.done":
        process.stdout.write("\n");                  // text segment finished
        break;
      case "response.completed":
        // Get the final structured response (citations, tool traces, etc.)
        const final = await stream.finalResponse();
        // Use final.output, final.citations, final.tool_results as needed
        console.dir(final, { depth: null });
        break;
      case "error":
        console.error("ERR:", event.error);
        break;
      default:
        // Optional: observe other semantic events (tool calls, status, etc.)
        // console.log(event);
        break;
    }
  }
}

run().catch(console.error);
```
Notes:

Event names to expect for text: response.created, response.output_text.delta, response.output_text.done, response.completed, plus error. These are the canonical semantic SSE events for the Responses API stream. 
LM Studio
+3
OpenAI Plattform
+3
OpenAI Plattform
+3

Deep Research is invoked by selecting the o3-deep-research model; it streams via the same Responses API event schema, so the handling above applies unchanged. 
OpenAI
+1

If you need resumability or long jobs, you can run in background with streaming and use event sequence_number to resume; this pattern is documented for Responses-compatible services.

### Backend: MCP Tool
We need a new MCP Tool named start_deep_research(<relative file name to research brief>). It receives the relative path of a file in the workspace of the project like workspace/<project>/researc/my-research-brief.md.

The tool calls the function in backend/src/deep-research.

Please provide a system prompt which will trigger the tool in src/backend/prompts/researcher.md.