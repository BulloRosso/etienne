import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Standalone test for deep research service
 * This will help us understand exactly what data OpenAI returns and when
 */

const WORKSPACE_ROOT = 'C:/Data/GitHub/claude-multitenant/workspace';
const PROJECT_NAME = 'deep-four';
const INPUT_FILE = 'research/germany-green-materials-brief.md';
const OUTPUT_FILE = 'test-research-output.md';

async function testDeepResearch() {
  console.log('='.repeat(80));
  console.log('DEEP RESEARCH SERVICE TEST');
  console.log('='.repeat(80));
  console.log(`Project: ${PROJECT_NAME}`);
  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('='.repeat(80));

  // Initialize OpenAI client
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const openaiClient = new OpenAI({ apiKey });

  // Read the research brief
  const projectPath = join(WORKSPACE_ROOT, PROJECT_NAME);
  const inputFilePath = join(projectPath, INPUT_FILE);
  const outputFilePath = join(projectPath, OUTPUT_FILE);

  console.log(`\nReading research brief from: ${inputFilePath}`);
  const researchBrief = await fs.readFile(inputFilePath, 'utf8');
  console.log(`Brief length: ${researchBrief.length} characters\n`);

  // Initialize output file
  await fs.writeFile(outputFilePath, '', 'utf8');

  // Track output items and their content
  const currentOutputItem: { type: string; itemId: string } | null = null;
  const outputItemContent = new Map<string, string>();

  console.log('Starting OpenAI stream...\n');

  try {
    const stream = await openaiClient.responses.stream({
      model: 'o3-deep-research',
      input: researchBrief,
      stream: true,
      tools: [{ type: 'web_search_preview' }],
    });

    let eventCount = 0;

    for await (const event of stream) {
      eventCount++;
      const eventType = event.type;

      console.log(`\n[${'='.repeat(70)}]`);
      console.log(`Event #${eventCount}: ${eventType}`);
      console.log(`[${'='.repeat(70)}]`);

      // Log the FULL event structure for key events
      switch (eventType) {
        case 'response.created':
          console.log('✓ Response created');
          console.log('Full event:', JSON.stringify(event, null, 2));
          break;

        case 'response.in_progress':
          console.log('⚡ Response in progress');
          break;

        case 'response.web_search_call.in_progress':
          console.log('🔍 Web search in progress');
          console.log('Full event:', JSON.stringify(event, null, 2));
          const inProgressQuery = (event as any).call?.query || (event as any).query;
          console.log(`Query: ${inProgressQuery}`);
          break;

        case 'response.web_search_call.searching':
          console.log('🌐 Web search searching');
          console.log('Full event:', JSON.stringify(event, null, 2));
          const searchingQuery = (event as any).call?.query || (event as any).query;
          console.log(`Query: ${searchingQuery}`);
          break;

        case 'response.web_search_call.completed':
          console.log('✓ Web search completed');
          console.log('Full event:', JSON.stringify(event, null, 2));
          const completedCall = (event as any).call;
          const results = completedCall?.results || (event as any).results;
          console.log(`Results count: ${results ? results.length : 0}`);
          if (results && results.length > 0) {
            console.log('First result:', JSON.stringify(results[0], null, 2));
          }
          break;

        case 'response.output_item.added':
          console.log('📝 Output item added');
          console.log('Full event:', JSON.stringify(event, null, 2));
          const addedItem = (event as any).item;
          console.log(`Item type: ${addedItem?.type}`);
          console.log(`Item id: ${addedItem?.id}`);
          if (addedItem?.type === 'reasoning') {
            console.log('Reasoning item details:');
            console.log(`  - summary: ${addedItem.summary}`);
            console.log(`  - question: ${addedItem.question}`);
          }
          // Initialize content tracking
          if (addedItem?.id) {
            outputItemContent.set(addedItem.id, '');
          }
          break;

        case 'response.output_item.done':
          console.log('✓ Output item done');
          console.log('Full event:', JSON.stringify(event, null, 2));
          const doneItem = (event as any).item;
          console.log(`Item type: ${doneItem?.type}`);
          console.log(`Item id: ${doneItem?.id}`);
          const fullContent = outputItemContent.get(doneItem?.id) || '';
          console.log(`Accumulated content length: ${fullContent.length} characters`);
          if (fullContent.length > 0) {
            console.log(`Content preview: ${fullContent.substring(0, 200)}...`);
          }
          if (doneItem?.type === 'reasoning') {
            console.log('Reasoning item details:');
            console.log(`  - summary: ${doneItem.summary}`);
            console.log(`  - question: ${doneItem.question}`);
          }
          break;

        case 'response.content_part.added':
          console.log('📄 Content part added');
          console.log('Full event:', JSON.stringify(event, null, 2));
          break;

        case 'response.content_part.done':
          console.log('✓ Content part done');
          console.log('Full event:', JSON.stringify(event, null, 2));
          break;

        case 'response.output_text.delta':
          const delta = (event as any).delta;
          console.log(`📝 Text delta (${delta?.length || 0} chars)`);
          console.log(`Delta preview: "${delta?.substring(0, 100)}..."`);

          // Try to figure out which item this delta belongs to
          const itemId = (event as any).item_id || (event as any).output_index;
          console.log(`Item ID/Index: ${itemId}`);

          // Accumulate content
          if (itemId && outputItemContent.has(itemId)) {
            const existing = outputItemContent.get(itemId) || '';
            outputItemContent.set(itemId, existing + delta);
          }

          // Append to file
          await fs.appendFile(outputFilePath, delta, 'utf8');
          break;

        case 'response.output_text.done':
          console.log('✓ Output text done');
          console.log('Full event:', JSON.stringify(event, null, 2));
          break;

        case 'response.completed':
          console.log('✅ Response completed');
          const finalResponse = await stream.finalResponse();
          console.log('Full final response:', JSON.stringify(finalResponse, null, 2));

          console.log('\n' + '='.repeat(80));
          console.log('RESEARCH COMPLETED');
          console.log('='.repeat(80));
          console.log(`Total events: ${eventCount}`);
          console.log(`Output file: ${outputFilePath}`);

          // Check output file size
          const stats = await fs.stat(outputFilePath);
          console.log(`Output file size: ${stats.size} bytes`);

          return;

        case 'error':
          console.error('❌ Error event');
          console.error('Full event:', JSON.stringify(event, null, 2));
          throw new Error(`OpenAI error: ${(event as any).error}`);

        default:
          console.log(`Unknown event type: ${eventType}`);
          console.log('Full event:', JSON.stringify(event, null, 2));
          break;
      }
    }
  } catch (error: any) {
    console.error('\n' + '='.repeat(80));
    console.error('ERROR');
    console.error('='.repeat(80));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testDeepResearch().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
