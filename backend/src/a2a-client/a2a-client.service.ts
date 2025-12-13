import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  AgentCard,
  Message,
  MessageSendParams,
  SendMessageResponse,
  Task,
  Part,
  TextPart,
  FilePart,
  ExtractedResult,
  A2AClientOptions,
} from './types';

@Injectable()
export class A2AClientService {
  private readonly logger = new Logger(A2AClientService.name);
  private readonly defaultTimeout = 60000; // 60 seconds

  /**
   * Fetch an agent card from a URL
   */
  async fetchAgentCard(agentCardUrl: string, options?: A2AClientOptions): Promise<AgentCard> {
    try {
      this.logger.log(`Fetching agent card from: ${agentCardUrl}`);
      const response = await axios.get<AgentCard>(agentCardUrl, {
        timeout: options?.timeout ?? this.defaultTimeout,
        headers: {
          'Accept': 'application/json',
          ...options?.headers,
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch agent card from ${agentCardUrl}:`, error);
      throw new Error(`Failed to fetch agent card: ${error.message}`);
    }
  }

  /**
   * Send a message to an A2A agent
   */
  async sendMessage(
    agentBaseUrl: string,
    prompt: string,
    filePaths?: string[],
    options?: A2AClientOptions,
  ): Promise<ExtractedResult> {
    try {
      // Build message parts
      const parts: Part[] = [{ kind: 'text', text: prompt }];

      // Add files if provided
      if (filePaths && filePaths.length > 0) {
        for (const filePath of filePaths) {
          if (await fs.pathExists(filePath)) {
            const filePart = await this.createFilePart(filePath);
            parts.push(filePart);
          } else {
            this.logger.warn(`File not found: ${filePath}`);
          }
        }
      }

      // Create the message
      const message: Message = {
        messageId: uuidv4(),
        role: 'user',
        kind: 'message',
        parts,
      };

      // Send to agent
      const params: MessageSendParams = {
        message,
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text', 'file'],
        },
      };

      const a2aEndpoint = this.getA2AEndpoint(agentBaseUrl);
      this.logger.log(`Sending message to: ${a2aEndpoint}`);

      const response = await axios.post<SendMessageResponse>(a2aEndpoint, params, {
        timeout: options?.timeout ?? this.defaultTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options?.headers,
        },
      });

      // Process response
      if ('error' in response.data) {
        const errorResponse = response.data;
        throw new Error(`A2A Error ${errorResponse.error.code}: ${errorResponse.error.message}`);
      }

      return this.extractResult(response.data.result);
    } catch (error) {
      this.logger.error(`Failed to send message to ${agentBaseUrl}:`, error);
      throw error;
    }
  }

  /**
   * Create a file part from a local file
   */
  private async createFilePart(filePath: string): Promise<FilePart> {
    const fileBuffer = await fs.readFile(filePath);
    const base64Content = fileBuffer.toString('base64');
    const fileName = path.basename(filePath);
    const mimeType = this.getMimeType(fileName);

    return {
      kind: 'file',
      file: {
        bytes: base64Content,
        name: fileName,
        mimeType: mimeType,
      },
    };
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get the A2A endpoint URL from a base URL
   */
  private getA2AEndpoint(baseUrl: string): string {
    const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${url}/a2a`;
  }

  /**
   * Extract result from task or message response
   */
  private extractResult(result: Task | Message): ExtractedResult {
    const extracted: ExtractedResult = {
      status: 'completed',
    };

    if (result.kind === 'task') {
      const task = result as Task;
      extracted.taskId = task.id;
      extracted.status = task.status.state;

      // Extract text and files from artifacts
      if (task.artifacts && task.artifacts.length > 0) {
        const texts: string[] = [];
        const files: ExtractedResult['files'] = [];

        for (const artifact of task.artifacts) {
          for (const part of artifact.parts) {
            if (part.kind === 'text') {
              texts.push((part as TextPart).text);
            } else if (part.kind === 'file') {
              const filePart = part as FilePart;
              if (filePart.file.bytes) {
                files.push({
                  name: filePart.file.name || `file_${artifact.artifactId}`,
                  mimeType: filePart.file.mimeType,
                  content: Buffer.from(filePart.file.bytes, 'base64'),
                });
              }
            }
          }
        }

        if (texts.length > 0) {
          extracted.text = texts.join('\n\n');
        }
        if (files.length > 0) {
          extracted.files = files;
        }
      }

      // Also check status message for text
      if (!extracted.text && task.status.message) {
        const textParts = task.status.message.parts.filter(
          (p): p is TextPart => p.kind === 'text'
        );
        if (textParts.length > 0) {
          extracted.text = textParts.map(p => p.text).join('\n\n');
        }
      }
    } else {
      // Direct message response
      const message = result as Message;
      const texts: string[] = [];
      const files: ExtractedResult['files'] = [];

      for (const part of message.parts) {
        if (part.kind === 'text') {
          texts.push((part as TextPart).text);
        } else if (part.kind === 'file') {
          const filePart = part as FilePart;
          if (filePart.file.bytes) {
            files.push({
              name: filePart.file.name || 'response_file',
              mimeType: filePart.file.mimeType,
              content: Buffer.from(filePart.file.bytes, 'base64'),
            });
          }
        }
      }

      if (texts.length > 0) {
        extracted.text = texts.join('\n\n');
      }
      if (files.length > 0) {
        extracted.files = files;
      }
    }

    return extracted;
  }

  /**
   * Save extracted files to a directory
   */
  async saveExtractedFiles(result: ExtractedResult, outputDir: string): Promise<string[]> {
    const savedPaths: string[] = [];

    if (result.files && result.files.length > 0) {
      await fs.ensureDir(outputDir);

      for (const file of result.files) {
        const outputPath = path.join(outputDir, file.name);
        await fs.writeFile(outputPath, file.content);
        savedPaths.push(outputPath);
        this.logger.log(`Saved file to: ${outputPath}`);
      }
    }

    return savedPaths;
  }
}
