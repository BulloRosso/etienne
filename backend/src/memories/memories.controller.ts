import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { MemoriesService } from './memories.service';

interface AddMemoryDto {
  messages: Array<{ role: string; content: string }>;
  user_id: string;
  metadata?: Record<string, any>;
}

interface SearchMemoryDto {
  query: string;
  user_id: string;
  limit?: number;
}

@Controller('api/memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  /**
   * POST /api/memories/
   * Add memories from conversation
   */
  @Post()
  async addMemories(
    @Query('project') projectName: string,
    @Body() dto: AddMemoryDto
  ) {
    return this.memoriesService.addMemories(projectName, dto);
  }

  /**
   * POST /api/memories/search/
   * Search for relevant memories
   */
  @Post('search')
  async searchMemories(
    @Query('project') projectName: string,
    @Body() dto: SearchMemoryDto
  ) {
    return this.memoriesService.searchMemories(projectName, dto);
  }

  /**
   * GET /api/memories/extraction-prompt
   * Get the extraction prompt for a project (custom or default)
   */
  @Get('extraction-prompt')
  async getExtractionPrompt(
    @Query('project') projectName: string,
  ) {
    return this.memoriesService.getExtractionPrompt(projectName);
  }

  /**
   * PUT /api/memories/extraction-prompt
   * Save a custom extraction prompt for a project
   */
  @Put('extraction-prompt')
  async saveExtractionPrompt(
    @Query('project') projectName: string,
    @Body() body: { prompt: string },
  ) {
    return this.memoriesService.saveExtractionPrompt(projectName, body.prompt);
  }

  /**
   * DELETE /api/memories/extraction-prompt
   * Reset extraction prompt to default
   */
  @Delete('extraction-prompt')
  async resetExtractionPrompt(
    @Query('project') projectName: string,
  ) {
    return this.memoriesService.resetExtractionPrompt(projectName);
  }

  /**
   * GET /api/memories/:user_id/
   * Get all memories for a user
   */
  @Get(':user_id')
  async getAllMemories(
    @Query('project') projectName: string,
    @Param('user_id') userId: string,
    @Query('limit') limit?: string
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.memoriesService.getAllMemories(projectName, userId, limitNum);
  }

  /**
   * DELETE /api/memories/:memory_id/
   * Delete a specific memory
   */
  @Delete(':memory_id')
  async deleteMemory(
    @Query('project') projectName: string,
    @Param('memory_id') memoryId: string,
    @Query('user_id') userId: string
  ) {
    return this.memoriesService.deleteMemory(projectName, memoryId, userId);
  }

  /**
   * DELETE /api/memories/
   * Delete all memories for a user
   */
  @Delete()
  async deleteAllMemories(
    @Query('project') projectName: string,
    @Query('user_id') userId: string
  ) {
    return this.memoriesService.deleteAllMemories(projectName, userId);
  }
}
