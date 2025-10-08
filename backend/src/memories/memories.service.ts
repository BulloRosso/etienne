import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';
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
   * Apply memory decay filter based on MEMORY_DECAY_DAYS
   */
  private filterDecayedMemories(memories: Memory[]): Memory[] {
    if (this.memoryDecayDays <= 0) {
      return memories;
    }

    const now = new Date();
    const decayThreshold = new Date(now.getTime() - this.memoryDecayDays * 24 * 60 * 60 * 1000);

    return memories.filter(memory => {
      const relevantDate = memory.updated_at || memory.created_at;
      const memoryDate = new Date(relevantDate);
      return memoryDate >= decayThreshold;
    });
  }

  /**
   * Extract facts from conversation using OpenAI API
   */
  private async extractFacts(messages: Message[]): Promise<string[]> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const prompt = `You are a Personal Information Organizer, specialized in accurately storing facts, user memories, and preferences.

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
}

**Conversation to Analyze:**

${conversationText}

**Important:** Return ONLY the JSON object, no additional text or explanation.`;

    try {
      const response = await axios.post(
        `${openaiBaseUrl}/chat/completions`,
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content.trim();
      const cleanedContent = this.stripMarkdownFences(content);
      const result: MemoryExtractionResult = JSON.parse(cleanedContent);
      return result.facts || [];
    } catch (error: any) {
      console.error('Error extracting facts:', error.response?.data || error.message);
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

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

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
      const response = await axios.post(
        `${openaiBaseUrl}/chat/completions`,
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content.trim();
      const cleanedContent = this.stripMarkdownFences(content);
      const result: MemoryUpdateResult = JSON.parse(cleanedContent);
      return result;
    } catch (error: any) {
      console.error('Error updating memories:', error.response?.data || error.message);
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
    const facts = await this.extractFacts(messages);

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

    // Read memories
    let memories = await this.readMemories(projectName);

    // Filter by user_id
    memories = memories.filter(m => m.user_id === user_id);

    // Apply decay
    memories = this.filterDecayedMemories(memories);

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
    // Read memories
    let memories = await this.readMemories(projectName);

    // Filter by user_id
    memories = memories.filter(m => m.user_id === userId);

    // Apply decay
    memories = this.filterDecayedMemories(memories);

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
