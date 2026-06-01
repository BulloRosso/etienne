import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { LlmService } from '../llm/llm.service';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';

export interface CheatsheetItem {
  title: string;
  content: string;
}

export interface CheatsheetGroup {
  name: string;
  items: CheatsheetItem[];
}

export interface Cheatsheet {
  groups: CheatsheetGroup[];
}

export interface ExtractedItem {
  group: string;
  title: string;
  content: string;
}

@Injectable()
export class CheatsheetService {
  private readonly logger = new Logger(CheatsheetService.name);
  private readonly config = new ClaudeConfig();

  constructor(private readonly llmService: LlmService) {}

  private static SAFE_USERNAME = /^[A-Za-z0-9_.@-]+$/;

  private relPathFor(username: string): string {
    if (!CheatsheetService.SAFE_USERNAME.test(username)) {
      throw new Error('Invalid username');
    }
    return `${username}/cheatsheets/notes.cheatsheet.json`;
  }

  private absPathFor(project: string, username: string): string {
    const root = safeRoot(this.config.hostRoot, project);
    return join(root, this.relPathFor(username));
  }

  private normalize(raw: any): Cheatsheet {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return { groups: [] };
    return {
      groups: raw.groups
        .filter((g: any) => g && typeof g === 'object')
        .map((g: any) => ({
          name: typeof g.name === 'string' ? g.name : '',
          items: Array.isArray(g.items)
            ? g.items
                .filter((i: any) => i && typeof i === 'object')
                .map((i: any) => ({
                  title: typeof i.title === 'string' ? i.title : '',
                  content: typeof i.content === 'string' ? i.content : '',
                }))
            : [],
        })),
    };
  }

  async readForUser(
    project: string,
    username: string,
  ): Promise<{ exists: boolean; cheatsheet: Cheatsheet; path: string }> {
    const relPath = this.relPathFor(username);
    const absPath = this.absPathFor(project, username);
    try {
      const text = await fs.readFile(absPath, 'utf-8');
      try {
        return { exists: true, cheatsheet: this.normalize(JSON.parse(text)), path: relPath };
      } catch {
        return { exists: true, cheatsheet: { groups: [] }, path: relPath };
      }
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { exists: false, cheatsheet: { groups: [] }, path: relPath };
      }
      throw err;
    }
  }

  async writeForUser(
    project: string,
    username: string,
    cheatsheet: Cheatsheet,
  ): Promise<{ success: true; path: string }> {
    const relPath = this.relPathFor(username);
    const absPath = this.absPathFor(project, username);
    const normalized = this.normalize(cheatsheet);
    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return { success: true, path: relPath };
  }

  async extractItem(
    bubbleText: string,
    existingCheatsheet: Cheatsheet | null,
  ): Promise<ExtractedItem> {
    const fallback: ExtractedItem = { group: '', title: '', content: bubbleText };

    const existingGroups = (existingCheatsheet?.groups || [])
      .map((g) => g?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);

    const groupsHint = existingGroups.length
      ? `The user already has these groups: ${existingGroups.map((g) => JSON.stringify(g)).join(', ')}. Prefer reusing one of them when it fits; otherwise propose a new short group name.`
      : `The user has no existing groups yet. Propose a short, descriptive group name.`;

    const prompt = `You are turning a snippet from a chat reply into a single cheat-sheet entry.

${groupsHint}

Read the snippet and produce a JSON object with exactly these fields:
  - "group": short group name (1-3 words)
  - "title": short, descriptive title (max ~60 chars)
  - "content": the useful body as Markdown (concise, just the takeaway — no preamble, no "Here is...")

Return ONLY the JSON object, no commentary, no code fences.

Snippet:
"""
${bubbleText}
"""`;

    let raw: string;
    try {
      raw = await this.llmService.generateText({
        tier: 'small',
        prompt,
        maxOutputTokens: 1024,
      });
    } catch (err) {
      this.logger.warn(`LLM call failed for cheatsheet extraction: ${(err as Error).message}`);
      return fallback;
    }

    try {
      const cleaned = this.stripMarkdownFences(raw.trim());
      const parsed = this.safeJsonParse<Partial<ExtractedItem>>(cleaned);
      return {
        group: (parsed.group || '').toString().trim(),
        title: (parsed.title || '').toString().trim(),
        content: (parsed.content || bubbleText).toString(),
      };
    } catch (err) {
      this.logger.warn(`Failed to parse LLM extraction JSON: ${(err as Error).message}`);
      return fallback;
    }
  }

  private stripMarkdownFences(content: string): string {
    return content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  private safeJsonParse<T>(raw: string): T {
    try {
      return JSON.parse(raw);
    } catch {
      let repaired = raw.replace(/,\s*$/, '');

      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        repaired += '"';
      }

      const opens = { '{': 0, '[': 0 };
      let inString = false;
      for (let i = 0; i < repaired.length; i++) {
        const ch = repaired[i];
        if (ch === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === '{') opens['{']++;
        else if (ch === '}') opens['{']--;
        else if (ch === '[') opens['[']++;
        else if (ch === ']') opens['[']--;
      }

      repaired = repaired.replace(/,\s*$/, '');
      for (let i = 0; i < opens['[']; i++) repaired += ']';
      for (let i = 0; i < opens['{']; i++) repaired += '}';

      return JSON.parse(repaired);
    }
  }
}
