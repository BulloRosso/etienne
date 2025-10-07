import { promises as fs } from 'fs';
import { join } from 'path';

export interface ChatMessage {
  timestamp: string;
  isAgent: boolean;
  message: string;
  costs?: any;
}

export interface ChatHistory {
  messages: ChatMessage[];
}

export class ChatPersistence {
  private historyPath: string;

  constructor(projectRoot: string) {
    this.historyPath = join(projectRoot, '.etienne', 'chat.history.json');
  }

  async loadHistory(): Promise<ChatHistory> {
    try {
      console.log(`[ChatPersistence] Reading from: ${this.historyPath}`);
      const content = await fs.readFile(this.historyPath, 'utf8');
      const parsed = JSON.parse(content);
      console.log(`[ChatPersistence] Successfully read ${parsed.messages?.length || 0} messages`);
      return parsed;
    } catch (error: any) {
      console.error(`[ChatPersistence] Error loading history: ${error.message}`);
      return { messages: [] };
    }
  }

  async saveHistory(history: ChatHistory): Promise<void> {
    const dir = join(this.historyPath, '..');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), 'utf8');
  }

  async appendMessage(message: ChatMessage): Promise<void> {
    const history = await this.loadHistory();
    history.messages.push(message);
    await this.saveHistory(history);
  }

  async appendMessages(messages: ChatMessage[]): Promise<void> {
    const history = await this.loadHistory();
    history.messages.push(...messages);
    await this.saveHistory(history);
  }
}
