import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { InterceptorsService } from '../interceptors/interceptors.service';

interface Memory {
  id: string;
  memory: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, any>;
}

interface Message {
  role: string;
  content: string;
}

interface AddMemoryDto {
  messages: Message[];
  user_id: string;
  metadata?: Record<string, any>;
}

interface SearchMemoryDto {
  query: string;
  user_id: string;
  limit?: number;
}

interface MemoryExtractionResult {
  facts: string[];
}

interface MemoryUpdateResult {
  memory: Array<{
    id: string;
    text: string;
    event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
    old_memory?: string;
  }>;
}

@Injectable()
export class MemoriesService {
  private readonly workspaceRoot: string;
  private readonly memoryDecayDays: number;

  constructor(private readonly interceptorsService: InterceptorsService) {
    this.workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
    this.memoryDecayDays = parseInt(process.env.MEMORY_DECAY_DAYS || '6', 10);
  }

  /**
   * Strip markdown code fences from JSON response
   */
  private stripMarkdownFences(content: string): string {
    // Remove ```json or ``` markers if present
    return content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  /**
   * Get the path to the memories.json file for a given project
   */
  private getMemoryFilePath(projectName: string): string {
    return join(this.workspaceRoot, projectName, '.etienne', 'memories.json');
  }

  /**
   * Get the path to the custom extraction prompt file for a given project
   */
  private getExtractionPromptPath(projectName: string): string {
    return join(this.workspaceRoot, projectName, '.etienne', 'long-term-memory', 'extraction-prompt.md');
  }

  /**
   * Get the path to the settings file for a given project
   */
  private getSettingsPath(projectName: string): string {
    return join(this.workspaceRoot, projectName, '.etienne', 'long-term-memory', 'settings.json');
  }

  private readonly defaultSettings = {
    memoryEnabled: true,
    decayDays: 6,
    searchLimit: 5,
  };

  /**
   * Get memory settings for a project (merged with defaults)
   */
  async getSettings(projectName: string): Promise<{ memoryEnabled: boolean; decayDays: number; searchLimit: number }> {
    const filePath = this.getSettingsPath(projectName);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const saved = JSON.parse(content);
      return { ...this.defaultSettings, ...saved };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { ...this.defaultSettings };
      }
      throw error;
    }
  }

  /**
   * Save memory settings for a project
   */
  async saveSettings(projectName: string, settings: Partial<{ memoryEnabled: boolean; decayDays: number; searchLimit: number }>): Promise<{ success: boolean }> {
    const filePath = this.getSettingsPath(projectName);
    const dir = join(this.workspaceRoot, projectName, '.etienne', 'long-term-memory');

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');

    return { success: true };
  }

  /**
   * Get the default extraction prompt (the hardcoded one)
   */
  getDefaultExtractionPrompt(): string {
    return `You are a Personal Information Organizer, specialized in accurately storing facts, user memories, and preferences.

Your task is to extract relevant pieces of information from conversations and organize them into distinct, manageable facts. This allows for easy retrieval and personalization in future interactions.

**Types of Information to Extract:**

1. **Personal Identity**: Name, age, location, occupation, education
2. **Preferences**: Likes, dislikes, favorites (food, music, activities, etc.)
3. **Biographical Facts**: Family, relationships, life events
4. **Goals & Aspirations**: Future plans, ambitions, targets
5. **Habits & Routines**: Daily activities, schedules, rituals
6. **Skills & Expertise**: Professional skills, hobbies, talents
7. **Health Information**: Dietary restrictions, allergies, fitness goals
8. **Opinions & Values**: Beliefs, perspectives, principles
9. **Experiences**: Past events, memories, stories
10. **Context**: Work context, project details, ongoing tasks

**Extraction Guidelines:**

1. Extract ONLY from user and assistant messages (ignore system messages)
2. Make facts concise and self-contained (5-15 words ideal)
3. Start directly with the fact (e.g., "Prefers dark mode" not "The user prefers dark mode")
4. Avoid redundancy - each fact should be distinct
5. Include temporal information when relevant (e.g., "Started learning Python in 2023")
6. Preserve specificity (e.g., "Drinks oat milk latte" not just "Drinks coffee")
7. Detect input language and record facts in the same language
8. If no relevant information found, return empty list
9. Focus on facts that would be useful for future personalization

**Output Format:**

Return ONLY a valid JSON object with this structure:

{
    "facts": [
        "fact 1 here",
        "fact 2 here",
        "fact 3 here"
    ]
}`;
  }

  /**
   * Get the extraction prompt for a project (custom if exists, otherwise default)
   */
  async getExtractionPrompt(projectName: string): Promise<{ prompt: string; isCustom: boolean }> {
    const filePath = this.getExtractionPromptPath(projectName);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { prompt: content, isCustom: true };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { prompt: this.getDefaultExtractionPrompt(), isCustom: false };
      }
      throw error;
    }
  }

  /**
   * Save a custom extraction prompt for a project
   */
  async saveExtractionPrompt(projectName: string, prompt: string): Promise<{ success: boolean }> {
    const filePath = this.getExtractionPromptPath(projectName);
    const dir = join(this.workspaceRoot, projectName, '.etienne', 'long-term-memory');

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, prompt, 'utf8');

    return { success: true };
  }

  /**
   * Reset extraction prompt to default by deleting the custom file
   */
  async resetExtractionPrompt(projectName: string): Promise<{ prompt: string }> {
    const filePath = this.getExtractionPromptPath(projectName);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return { prompt: this.getDefaultExtractionPrompt() };
  }

  /**
   * Read memories from file
   */
  private async readMemories(projectName: string): Promise<Memory[]> {
    const filePath = this.getMemoryFilePath(projectName);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Write memories to file
   */
  private async writeMemories(projectName: string, memories: Memory[]): Promise<void> {
    const filePath = this.getMemoryFilePath(projectName);
    const dir = join(this.workspaceRoot, projectName, '.etienne');

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(memories, null, 2), 'utf8');
  }

  /**
   * Apply memory decay filter based on decayDays parameter
   */
  private filterDecayedMemories(memories: Memory[], decayDays: number): Memory[] {
    if (decayDays <= 0) {
      return memories;
    }

    const now = new Date();
    const decayThreshold = new Date(now.getTime() - decayDays * 24 * 60 * 60 * 1000);

    return memories.filter(memory => {
      const relevantDate = memory.updated_at || memory.created_at;
      const memoryDate = new Date(relevantDate);
      return memoryDate >= decayThreshold;
    });
  }

  /**
   * Extract facts from conversation using Anthropic API
   */
  private async extractFacts(messages: Message[], projectName: string): Promise<string[]> {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const { prompt: extractionPrompt } = await this.getExtractionPrompt(projectName);

    const prompt = `${extractionPrompt}

**Conversation to Analyze:**

${conversationText}

**Important:** Return ONLY the JSON object, no additional text or explanation.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ],
      });

      const textContent = response.content.find((block: any) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const cleanedContent = this.stripMarkdownFences(textContent.text.trim());
      const result: MemoryExtractionResult = JSON.parse(cleanedContent);
      return result.facts || [];
    } catch (error: any) {
      console.error('Error extracting facts:', error.message);
      throw new Error(`Failed to extract facts: ${error.message}`);
    }
  }

  /**
   * Compare new facts with existing memories and determine actions
   */
  private async updateMemories(
    existingMemories: Memory[],
    newFacts: string[],
    userId: string
  ): Promise<MemoryUpdateResult> {
    if (newFacts.length === 0) {
      return { memory: [] };
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const existingMemoriesText = existingMemories
      .map(m => `${m.id}: ${m.memory}`)
      .join('\n');

    const newFactsText = newFacts.join('\n');

    const prompt = `You are a smart memory manager which controls the memory of a system.

You can perform four operations:
1. **ADD**: Add new information to memory
2. **UPDATE**: Modify existing memory with new information
3. **DELETE**: Remove outdated or contradictory information
4. **NONE**: No change needed (information already exists)

**Task:**
Compare newly retrieved facts with existing memories and determine the appropriate action for each memory item.

**Decision Logic:**

1. **ADD**: When new fact contains novel information not present in existing memory
   - Example: Old memory has "Works as engineer", new fact "Started learning Spanish" → ADD

2. **UPDATE**: When new fact refines, corrects, or provides more specific information about existing memory
   - Example: Old memory "Lives in California" + new fact "Lives in San Francisco" → UPDATE

3. **DELETE**: When new fact contradicts or invalidates existing memory
   - Example: Old memory "Loves pizza" + new fact "Became vegan, no longer eats pizza" → DELETE

4. **NONE**: When information is already captured in existing memory
   - Example: Old memory "Name is John" + new fact "Name is John" → NONE

**Input:**

Existing Memories:
${existingMemoriesText || 'No existing memories'}

New Facts:
${newFactsText}

**Output Format:**

Return ONLY a valid JSON object:

{
    "memory": [
        {
            "id": "mem_1",
            "text": "Updated or original memory text",
            "event": "ADD|UPDATE|DELETE|NONE",
            "old_memory": "original text (only for UPDATE)"
        }
    ]
}

**Important:** Be conservative with DELETE operations. Only delete when there's clear contradiction.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ],
      });

      const textContent = response.content.find((block: any) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const cleanedContent = this.stripMarkdownFences(textContent.text.trim());
      const result: MemoryUpdateResult = JSON.parse(cleanedContent);
      return result;
    } catch (error: any) {
      console.error('Error updating memories:', error.message);
      throw new Error(`Failed to update memories: ${error.message}`);
    }
  }

  /**
   * Generate a unique memory ID
   */
  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add memories from conversation
   */
  async addMemories(projectName: string, dto: AddMemoryDto) {
    const { messages, user_id, metadata } = dto;

    // Extract facts from conversation
    const facts = await this.extractFacts(messages, projectName);

    if (facts.length === 0) {
      return {
        results: [],
        message: 'No new information found to store'
      };
    }

    // Emit SSE event for memory extraction
    this.interceptorsService.addInterceptor(projectName, {
      event_type: 'MemoryExtracted',
      facts,
      count: facts.length,
      timestamp: new Date().toISOString(),
    });

    // Read existing memories
    const existingMemories = await this.readMemories(projectName);

    // Compare with existing memories
    const updateResult = await this.updateMemories(existingMemories, facts, user_id);

    const results: Array<{ id: string; memory: string; event: string }> = [];
    const updatedMemories = [...existingMemories];

    for (const item of updateResult.memory) {
      if (item.event === 'ADD') {
        const newMemory: Memory = {
          id: this.generateMemoryId(),
          memory: item.text,
          user_id,
          created_at: new Date().toISOString(),
          metadata,
        };
        updatedMemories.push(newMemory);
        results.push({ id: newMemory.id, memory: item.text, event: 'ADD' });
      } else if (item.event === 'UPDATE') {
        const existingIndex = updatedMemories.findIndex(m => m.id === item.id);
        if (existingIndex !== -1) {
          updatedMemories[existingIndex].memory = item.text;
          updatedMemories[existingIndex].updated_at = new Date().toISOString();
          results.push({ id: item.id, memory: item.text, event: 'UPDATE' });
        }
      } else if (item.event === 'DELETE') {
        const existingIndex = updatedMemories.findIndex(m => m.id === item.id);
        if (existingIndex !== -1) {
          updatedMemories.splice(existingIndex, 1);
          results.push({ id: item.id, memory: '', event: 'DELETE' });
        }
      }
      // NONE: do nothing
    }

    // Write updated memories
    await this.writeMemories(projectName, updatedMemories);

    const addedCount = results.filter(r => r.event === 'ADD').length;
    return {
      results,
      message: `Added ${addedCount} memories successfully`
    };
  }

  /**
   * Search memories
   */
  async searchMemories(projectName: string, dto: SearchMemoryDto) {
    const { query, user_id, limit = 5 } = dto;

    // Load per-project settings
    const settings = await this.getSettings(projectName);

    // Read memories
    let memories = await this.readMemories(projectName);

    // Filter by user_id
    memories = memories.filter(m => m.user_id === user_id);

    // Apply decay using per-project setting
    memories = this.filterDecayedMemories(memories, settings.decayDays);

    // Simple keyword search (for a production system, use vector embeddings)
    const queryLower = query.toLowerCase();
    const scoredMemories = memories.map(memory => {
      const memoryLower = memory.memory.toLowerCase();
      let score = 0;

      // Simple keyword matching
      const queryWords = queryLower.split(/\s+/);
      for (const word of queryWords) {
        if (memoryLower.includes(word)) {
          score += 1;
        }
      }

      return { memory, score };
    });

    // Sort by score and take top results
    const results = scoredMemories
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.memory);

    return { results };
  }

  /**
   * Get all memories for a user
   */
  async getAllMemories(projectName: string, userId: string, limit?: number) {
    // Load per-project settings
    const settings = await this.getSettings(projectName);

    // Read memories
    let memories = await this.readMemories(projectName);

    // Filter by user_id
    memories = memories.filter(m => m.user_id === userId);

    // Apply decay using per-project setting
    memories = this.filterDecayedMemories(memories, settings.decayDays);

    // Sort by created_at (newest first)
    memories.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Apply limit if specified
    if (limit && limit > 0) {
      memories = memories.slice(0, limit);
    }

    return { results: memories };
  }

  /**
   * Delete a specific memory
   */
  async deleteMemory(projectName: string, memoryId: string, userId: string) {
    const memories = await this.readMemories(projectName);

    const index = memories.findIndex(m => m.id === memoryId && m.user_id === userId);
    if (index === -1) {
      throw new Error('Memory not found');
    }

    memories.splice(index, 1);
    await this.writeMemories(projectName, memories);

    return { success: true, message: 'Memory deleted successfully' };
  }

  /**
   * Delete all memories for a user
   */
  async deleteAllMemories(projectName: string, userId: string) {
    let memories = await this.readMemories(projectName);

    const originalCount = memories.length;
    memories = memories.filter(m => m.user_id !== userId);
    const deletedCount = originalCount - memories.length;

    await this.writeMemories(projectName, memories);

    return { success: true, message: `Deleted ${deletedCount} memories` };
  }
}
