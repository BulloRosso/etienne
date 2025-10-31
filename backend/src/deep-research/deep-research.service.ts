import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Observable, ReplaySubject } from 'rxjs';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

interface ResearchSession {
  id: string;
  inputFile: string;
  outputFile: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}

interface ResearchEvent {
  type: string;
  data: {
    sessionId: string;
    inputFile: string;
    outputFile: string;
    [key: string]: any;
  };
}

@Injectable()
export class DeepResearchService {
  private readonly logger = new Logger(DeepResearchService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private readonly openaiClient: OpenAI;
  private eventSubjects = new Map<string, ReplaySubject<ResearchEvent>>();
  private activeSessions = new Map<string, ResearchSession>();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY environment variable is not set. Deep research will not be available.');
    }
    this.openaiClient = new OpenAI({ apiKey });
  }

  async startResearch(
    projectName: string,
    inputFile: string,
    outputFile?: string,
  ): Promise<{ sessionId: string; inputFile: string; outputFile: string }> {
    this.logger.log(`Starting research for project: ${projectName}, input: ${inputFile}`);

    // Generate session ID and default output file if not provided
    const sessionId = randomUUID();
    const finalOutputFile = outputFile || `research-output-${Date.now()}.research`;

    // Read the research brief
    const projectPath = join(this.workspaceRoot, projectName);
    const inputFilePath = join(projectPath, inputFile);

    let researchBrief: string;
    try {
      researchBrief = await fs.readFile(inputFilePath, 'utf8');
    } catch (error: any) {
      this.logger.error(`Failed to read research brief: ${error.message}`);
      throw new Error(`Could not read input file: ${inputFile}. Make sure the file exists.`);
    }

    // Create session record
    const session: ResearchSession = {
      id: sessionId,
      inputFile,
      outputFile: finalOutputFile,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    this.activeSessions.set(sessionId, session);
    await this.saveSession(projectName, session);

    // Start research in background
    this.executeResearch(projectName, sessionId, researchBrief, finalOutputFile).catch((error) => {
      this.logger.error(`Research execution failed: ${error.message}`);
    });

    return {
      sessionId,
      inputFile,
      outputFile: finalOutputFile,
    };
  }

  private async executeResearch(
    projectName: string,
    sessionId: string,
    researchBrief: string,
    outputFile: string,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const projectPath = join(this.workspaceRoot, projectName);
    const outputFilePath = join(projectPath, outputFile);

    // Emit started event
    this.emitEvent(projectName, {
      type: 'Research.started',
      data: {
        sessionId,
        inputFile: session.inputFile,
        outputFile: session.outputFile,
        timestamp: new Date().toISOString(),
      },
    });

    try {
      // Ensure output directory exists
      await fs.mkdir(join(outputFilePath, '..'), { recursive: true });

      // Initialize output file
      await fs.writeFile(outputFilePath, '', 'utf8');

      // Start streaming from OpenAI
      // Note: o3-deep-research requires at least one of: web_search_preview, mcp, or file_search
      const stream = await this.openaiClient.responses.stream({
        model: 'o3-deep-research',
        input: researchBrief,
        stream: true,
        tools: [{ type: 'web_search_preview' }],
      });

      let accumulatedText = '';

      for await (const event of stream) {
        switch (event.type) {
          // Response lifecycle events
          case 'response.created':
            this.emitEvent(projectName, {
              type: 'Research.created',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          case 'response.in_progress':
            this.emitEvent(projectName, {
              type: 'Research.in_progress',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          // Web search events
          case 'response.web_search_call.in_progress':
            this.logger.debug(`Full OpenAI event structure for web_search_call.in_progress: ${JSON.stringify(event, null, 2)}`);
            this.emitEvent(projectName, {
              type: 'Research.web_search.in_progress',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: (event as any).item_id,
                output_index: (event as any).output_index,
                query: (event as any).call?.query || (event as any).query,
                search_type: (event as any).call?.type || (event as any).type,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          case 'response.web_search_call.searching':
            // Debug: log the full event structure to understand OpenAI's format
            this.logger.debug(`Full OpenAI event structure for web_search_call.searching: ${JSON.stringify(event, null, 2)}`);
            const searchQuery = (event as any).call?.query || (event as any).query;
            const searchStatus = (event as any).status;
            this.logger.debug(`Extracted query: ${searchQuery}, status: ${searchStatus}`);
            this.emitEvent(projectName, {
              type: 'Research.web_search.searching',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: (event as any).item_id,
                output_index: (event as any).output_index,
                query: searchQuery,
                status: searchStatus,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          case 'response.web_search_call.completed':
            this.logger.debug(`Full OpenAI event structure for web_search_call.completed: ${JSON.stringify(event, null, 2)}`);
            const completedCall = (event as any).call;
            const results = completedCall?.results || (event as any).results;
            const resultCount = results ? results.length : 0;
            this.emitEvent(projectName, {
              type: 'Research.web_search.completed',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: (event as any).item_id,
                output_index: (event as any).output_index,
                query: completedCall?.query || (event as any).query,
                result_count: resultCount,
                results: results ? results.map((r: any) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet?.substring(0, 150) // Limit snippet length
                })) : [],
                timestamp: new Date().toISOString(),
              },
            });
            break;

          // Output item events
          case 'response.output_item.added':
            this.logger.debug(`Full OpenAI event structure for output_item.added: ${JSON.stringify(event, null, 2)}`);
            const addedItem = (event as any).item;
            this.emitEvent(projectName, {
              type: 'Research.output_item.added',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: addedItem?.id,
                item_type: addedItem?.type,
                output_index: (event as any).output_index,
                content_preview: this.extractContentPreview(addedItem),
                // Capture reasoning information if available
                reasoning: addedItem?.type === 'reasoning' ? {
                  summary: addedItem.summary,
                  question: addedItem.question,
                } : undefined,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          case 'response.output_item.done':
            this.logger.debug(`Full OpenAI event structure for output_item.done: ${JSON.stringify(event, null, 2)}`);
            const doneItem = (event as any).item;
            this.emitEvent(projectName, {
              type: 'Research.output_item.done',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: doneItem?.id,
                item_type: doneItem?.type,
                output_index: (event as any).output_index,
                content_preview: this.extractContentPreview(doneItem),
                // Capture reasoning information if available
                reasoning: doneItem?.type === 'reasoning' ? {
                  summary: doneItem.summary,
                  question: doneItem.question,
                } : undefined,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          // Content part events
          case 'response.content_part.added':
            this.emitEvent(projectName, {
              type: 'Research.content_part.added',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: (event as any).item_id,
                content_index: (event as any).content_index,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          case 'response.content_part.done':
            this.emitEvent(projectName, {
              type: 'Research.content_part.done',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                item_id: (event as any).item_id,
                content_index: (event as any).content_index,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          // Text output events
          case 'response.output_text.delta':
            // Emit delta event
            this.emitEvent(projectName, {
              type: 'Research.output_text.delta',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                delta: event.delta,
                timestamp: new Date().toISOString(),
              },
            });

            // Accumulate and append to file
            accumulatedText += event.delta;
            await fs.appendFile(outputFilePath, event.delta, 'utf8');
            break;

          case 'response.output_text.done':
            // Emit text done event
            this.emitEvent(projectName, {
              type: 'Research.output_text.done',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                timestamp: new Date().toISOString(),
              },
            });
            break;

          // Completion
          case 'response.completed':
            // Get final response with citations
            const finalResponse = await stream.finalResponse();

            // Emit completed event
            this.emitEvent(projectName, {
              type: 'Research.completed',
              data: {
                sessionId,
                inputFile: session.inputFile,
                outputFile: session.outputFile,
                citations: (finalResponse as any).citations || [],
                toolResults: (finalResponse as any).tool_results || [],
                timestamp: new Date().toISOString(),
              },
            });

            // Update session
            session.status = 'completed';
            session.completedAt = new Date().toISOString();
            await this.saveSession(projectName, session);

            this.logger.log(`Research completed for session: ${sessionId}`);

            // Complete the subject to stop emitting events
            if (this.eventSubjects.has(projectName)) {
              this.eventSubjects.get(projectName)!.complete();
              this.eventSubjects.delete(projectName);
              this.logger.log(`Completed and removed event subject for project: ${projectName}`);
            }

            // Exit the loop - research is done
            return;
            break;

          // Error handling
          case 'error':
            throw new Error(`OpenAI error: ${(event as any).error}`);

          default:
            // Log other events for debugging
            this.logger.debug(`Received event type: ${event.type}`);
            break;
        }
      }
    } catch (error: any) {
      this.logger.error(`Research failed for session ${sessionId}: ${error.message}`);

      // Emit error event
      this.emitEvent(projectName, {
        type: 'Research.error',
        data: {
          sessionId,
          inputFile: session.inputFile,
          outputFile: session.outputFile,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      });

      // Update session
      session.status = 'error';
      session.error = error.message;
      session.completedAt = new Date().toISOString();
      await this.saveSession(projectName, session);

      // Complete the subject to stop emitting events
      if (this.eventSubjects.has(projectName)) {
        this.eventSubjects.get(projectName)!.complete();
        this.eventSubjects.delete(projectName);
        this.logger.log(`Completed and removed event subject for project: ${projectName} after error`);
      }
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  getEventStream(projectName: string): Observable<ResearchEvent> {
    if (!this.eventSubjects.has(projectName)) {
      // Use ReplaySubject to buffer events for late subscribers (buffer last 100 events)
      this.eventSubjects.set(projectName, new ReplaySubject<ResearchEvent>(100));
      this.logger.log(`Created new ReplaySubject for project: ${projectName}`);
    }
    this.logger.log(`Returning event stream for project: ${projectName}`);
    return this.eventSubjects.get(projectName)!.asObservable();
  }

  private extractContentPreview(item: any): string | undefined {
    if (!item) return undefined;

    // Try to extract text content from various possible locations
    if (item.content && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === 'text' && part.text) {
          return part.text.substring(0, 60);
        }
      }
    }

    // Try direct text property
    if (item.text) {
      return item.text.substring(0, 60);
    }

    // Try call arguments for tool calls
    if (item.call && item.call.arguments) {
      const args = typeof item.call.arguments === 'string'
        ? item.call.arguments
        : JSON.stringify(item.call.arguments);
      return args.substring(0, 60);
    }

    return undefined;
  }

  private emitEvent(projectName: string, event: ResearchEvent): void {
    if (!this.eventSubjects.has(projectName)) {
      // Use ReplaySubject to buffer events for late subscribers (buffer last 100 events)
      this.eventSubjects.set(projectName, new ReplaySubject<ResearchEvent>(100));
      this.logger.log(`Created new ReplaySubject for project: ${projectName}`);
    }
    this.logger.log(`Emitting event ${event.type} for project ${projectName}`);
    const subject = this.eventSubjects.get(projectName)!;
    this.logger.log(`Subject has ${subject.observers.length} observers`);
    subject.next(event);
  }

  async getSessions(projectName: string): Promise<ResearchSession[]> {
    const sessionsPath = join(this.workspaceRoot, projectName, '.etienne', 'deep-research-sessions.json');

    try {
      const data = await fs.readFile(sessionsPath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.sessions || [];
    } catch (error) {
      // File doesn't exist or is invalid
      return [];
    }
  }

  private async saveSession(projectName: string, session: ResearchSession): Promise<void> {
    const projectPath = join(this.workspaceRoot, projectName);
    const etiennePath = join(projectPath, '.etienne');
    const sessionsPath = join(etiennePath, 'deep-research-sessions.json');

    // Ensure .etienne directory exists
    await fs.mkdir(etiennePath, { recursive: true });

    // Load existing sessions
    let sessions: ResearchSession[] = [];
    try {
      const data = await fs.readFile(sessionsPath, 'utf8');
      const parsed = JSON.parse(data);
      sessions = parsed.sessions || [];
    } catch {
      // File doesn't exist yet
    }

    // Update or add session
    const index = sessions.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    // Save
    await fs.writeFile(
      sessionsPath,
      JSON.stringify({ sessions }, null, 2),
      'utf8',
    );
  }

  async checkFileExists(projectName: string, fileName: string): Promise<boolean> {
    const filePath = join(this.workspaceRoot, projectName, fileName);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
