import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { InternalEvent, RuleExecutionResult } from '../interfaces/event.interface';

interface SSEClient {
  id: string;
  projectName: string;
  response: Response;
  lastHeartbeat: number;
}

@Injectable()
export class SSEPublisherService {
  private readonly logger = new Logger(SSEPublisherService.name);
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    // Start heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // Every 30 seconds
  }

  /**
   * Register a new SSE client
   */
  addClient(clientId: string, projectName: string, response: Response): void {
    this.clients.set(clientId, {
      id: clientId,
      projectName,
      response,
      lastHeartbeat: Date.now(),
    });

    this.logger.log(`SSE client connected: ${clientId} for project ${projectName}`);

    // Send initial connection message
    this.sendToClient(clientId, 'connected', { message: 'Event stream connected' });

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(clientId);
    });
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.logger.log(`SSE client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }

  /**
   * Publish event to all clients of a project
   */
  publishEvent(projectName: string, event: InternalEvent): void {
    for (const client of this.clients.values()) {
      if (client.projectName === projectName) {
        this.sendToClient(client.id, 'event', event);
      }
    }
  }

  /**
   * Publish rule execution results to all clients of a project
   */
  publishRuleExecution(
    projectName: string,
    event: InternalEvent,
    results: RuleExecutionResult[],
  ): void {
    const successfulRules = results.filter((r) => r.success);

    if (successfulRules.length > 0) {
      for (const client of this.clients.values()) {
        if (client.projectName === projectName) {
          this.sendToClient(client.id, 'rule-execution', {
            event,
            triggeredRules: successfulRules,
          });
        }
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(clientId: string, eventType: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(message);
    } catch (error) {
      this.logger.error(`Failed to send to client ${clientId}`, error);
      this.removeClient(clientId);
    }
  }

  /**
   * Send heartbeat to all clients
   */
  private sendHeartbeat(): void {
    const now = Date.now();
    for (const client of this.clients.values()) {
      try {
        const message = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: now })}\n\n`;
        client.response.write(message);
        client.lastHeartbeat = now;
      } catch (error) {
        this.logger.error(`Heartbeat failed for client ${client.id}`, error);
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(projectName?: string): number {
    if (projectName) {
      return Array.from(this.clients.values()).filter(
        (c) => c.projectName === projectName,
      ).length;
    }
    return this.clients.size;
  }

  /**
   * Cleanup on shutdown
   */
  onModuleDestroy(): void {
    clearInterval(this.heartbeatInterval);
    for (const client of this.clients.values()) {
      try {
        client.response.end();
      } catch (error) {
        this.logger.error(`Error closing client ${client.id}`, error);
      }
    }
    this.clients.clear();
  }
}
