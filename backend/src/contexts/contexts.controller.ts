import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ContextsService, Context } from './contexts.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/workspace/:projectName/contexts')
export class ContextsController {
  private readonly logger = new Logger(ContextsController.name);

  constructor(private readonly contextsService: ContextsService) {}

  /**
   * GET /api/workspace/:project/contexts
   * Get all contexts for a project
   */
  @Get()
  async getAllContexts(@Param('projectName') projectName: string): Promise<Context[]> {
    this.logger.log(`Getting all contexts for project: ${projectName}`);
    return this.contextsService.getAllContexts(projectName);
  }

  /**
   * GET /api/workspace/:project/contexts/:id
   * Get a specific context by ID
   */
  @Get(':id')
  async getContext(
    @Param('projectName') projectName: string,
    @Param('id') contextId: string,
  ): Promise<Context> {
    this.logger.log(`Getting context ${contextId} for project: ${projectName}`);
    const context = await this.contextsService.getContext(projectName, contextId);

    if (!context) {
      throw new NotFoundException(`Context ${contextId} not found`);
    }

    return context;
  }

  /**
   * GET /api/workspace/:project/contexts/:id/scope
   * Get the scope (files, tags, etc.) for a context
   */
  @Get(':id/scope')
  async getContextScope(
    @Param('projectName') projectName: string,
    @Param('id') contextId: string,
  ) {
    this.logger.log(`Getting scope for context ${contextId} in project: ${projectName}`);
    const scope = await this.contextsService.getContextScope(projectName, contextId);

    if (!scope) {
      throw new NotFoundException(`Context ${contextId} not found`);
    }

    return scope;
  }

  /**
   * POST /api/workspace/:project/contexts
   * Create a new context
   */
  @Roles('user')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createContext(
    @Param('projectName') projectName: string,
    @Body() context: Omit<Context, 'id'>,
  ): Promise<Context> {
    this.logger.log(`Creating context for project: ${projectName}`);
    return this.contextsService.createContext(projectName, context);
  }

  /**
   * PUT /api/workspace/:project/contexts/:id
   * Update an existing context
   */
  @Roles('user')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateContext(
    @Param('projectName') projectName: string,
    @Param('id') contextId: string,
    @Body() updates: Partial<Omit<Context, 'id'>>,
  ): Promise<Context> {
    this.logger.log(`Updating context ${contextId} for project: ${projectName}`);
    const context = await this.contextsService.updateContext(projectName, contextId, updates);

    if (!context) {
      throw new NotFoundException(`Context ${contextId} not found`);
    }

    return context;
  }

  /**
   * DELETE /api/workspace/:project/contexts/:id
   * Delete a context
   */
  @Roles('user')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteContext(
    @Param('projectName') projectName: string,
    @Param('id') contextId: string,
  ): Promise<{ deleted: boolean }> {
    this.logger.log(`Deleting context ${contextId} from project: ${projectName}`);
    const deleted = await this.contextsService.deleteContext(projectName, contextId);

    if (!deleted) {
      throw new NotFoundException(`Context ${contextId} not found`);
    }

    return { deleted: true };
  }

  /**
   * GET /api/workspace/:project/contexts/:id/files
   * Get all files accessible in a context
   */
  @Get(':id/files')
  async getFilesInContext(
    @Param('projectName') projectName: string,
    @Param('id') contextId: string,
  ): Promise<{ files: string[] }> {
    this.logger.log(`Getting files for context ${contextId} in project: ${projectName}`);
    const files = await this.contextsService.getFilesInContext(projectName, contextId);
    return { files };
  }
}
