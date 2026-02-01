import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  RemoteSessionsData,
  RemoteSessionMapping,
  PendingPairing,
} from './interfaces/remote-session.interface';

@Injectable()
export class RemoteSessionsStorageService {
  private readonly logger = new Logger(RemoteSessionsStorageService.name);
  private readonly dataPath: string;

  constructor() {
    // Store in backend/.etienne directory (global, not per-project)
    this.dataPath = join(process.cwd(), '.etienne', 'remote-sessions.json');
  }

  private async ensureDirectory(): Promise<void> {
    const dirPath = join(process.cwd(), '.etienne');
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory ${dirPath}:`, error);
      throw error;
    }
  }

  async loadData(): Promise<RemoteSessionsData> {
    try {
      await this.ensureDirectory();
      const data = await fs.readFile(this.dataPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, return default structure
        return {
          'remote-sessions': [],
          'pending-pairings': [],
        };
      }
      this.logger.error(`Failed to load remote sessions data:`, error);
      throw error;
    }
  }

  async saveData(data: RemoteSessionsData): Promise<void> {
    try {
      await this.ensureDirectory();
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
      this.logger.log(`Remote sessions data saved to ${this.dataPath}`);
    } catch (error) {
      this.logger.error(`Failed to save remote sessions data:`, error);
      throw error;
    }
  }

  // Session management methods
  async addSession(mapping: RemoteSessionMapping): Promise<void> {
    const data = await this.loadData();
    data['remote-sessions'].push(mapping);
    await this.saveData(data);
    this.logger.log(`Added session mapping for chatId: ${mapping.remoteSession.chatId}`);
  }

  async updateSession(id: string, updates: Partial<RemoteSessionMapping>): Promise<void> {
    const data = await this.loadData();
    const index = data['remote-sessions'].findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Session with id ${id} not found`);
    }
    data['remote-sessions'][index] = {
      ...data['remote-sessions'][index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await this.saveData(data);
    this.logger.log(`Updated session: ${id}`);
  }

  async removeSession(id: string): Promise<void> {
    const data = await this.loadData();
    data['remote-sessions'] = data['remote-sessions'].filter((s) => s.id !== id);
    await this.saveData(data);
    this.logger.log(`Removed session: ${id}`);
  }

  async findByChatId(chatId: number): Promise<RemoteSessionMapping | null> {
    const data = await this.loadData();
    return data['remote-sessions'].find((s) => s.remoteSession.chatId === chatId) || null;
  }

  async findByProject(projectName: string): Promise<RemoteSessionMapping[]> {
    const data = await this.loadData();
    return data['remote-sessions'].filter((s) => s.project.name === projectName);
  }

  async getAllSessions(): Promise<RemoteSessionMapping[]> {
    const data = await this.loadData();
    return data['remote-sessions'];
  }

  // Pairing management methods
  async addPendingPairing(pairing: PendingPairing): Promise<void> {
    const data = await this.loadData();

    // Remove any existing pairing for this chatId
    data['pending-pairings'] = data['pending-pairings'].filter(
      (p) => p.remoteSession.chatId !== pairing.remoteSession.chatId
    );

    data['pending-pairings'].push(pairing);
    await this.saveData(data);
    this.logger.log(`Added pending pairing with code: ${pairing.code}`);
  }

  async findPairingById(id: string): Promise<PendingPairing | null> {
    const data = await this.loadData();
    return data['pending-pairings'].find((p) => p.id === id) || null;
  }

  async findPairingByCode(code: string): Promise<PendingPairing | null> {
    const data = await this.loadData();
    return data['pending-pairings'].find((p) => p.code === code) || null;
  }

  async findPairingByChatId(chatId: number): Promise<PendingPairing | null> {
    const data = await this.loadData();
    return data['pending-pairings'].find((p) => p.remoteSession.chatId === chatId) || null;
  }

  async removePairing(id: string): Promise<void> {
    const data = await this.loadData();
    data['pending-pairings'] = data['pending-pairings'].filter((p) => p.id !== id);
    await this.saveData(data);
    this.logger.log(`Removed pairing: ${id}`);
  }

  async cleanupExpiredPairings(): Promise<number> {
    const data = await this.loadData();
    const now = new Date();
    const originalCount = data['pending-pairings'].length;

    data['pending-pairings'] = data['pending-pairings'].filter(
      (p) => new Date(p.expires_at) > now
    );

    const removedCount = originalCount - data['pending-pairings'].length;
    if (removedCount > 0) {
      await this.saveData(data);
      this.logger.log(`Cleaned up ${removedCount} expired pairings`);
    }

    return removedCount;
  }

  async getAllPendingPairings(): Promise<PendingPairing[]> {
    const data = await this.loadData();
    return data['pending-pairings'];
  }
}
