import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ScrapbookService, ScrapbookNode, CanvasSettings } from './scrapbook.service';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * DTO for creating a node
 */
interface CreateNodeDto {
  type?: string;
  label: string;
  description?: string;
  priority?: number;
  attentionWeight?: number;
  iconName?: string;
  parentId?: string;
}

/**
 * DTO for updating a node
 */
interface UpdateNodeDto {
  label?: string;
  description?: string;
  priority?: number;
  attentionWeight?: number;
  iconName?: string;
  images?: string[];
  customProperties?: Record<string, string | number>;
}

/**
 * Scrapbook Controller
 *
 * REST API endpoints for managing scrapbook mindmap nodes.
 * All endpoints are scoped to a project.
 */
@Controller('api/workspace/:projectName/scrapbook')
export class ScrapbookController {
  constructor(private readonly scrapbookService: ScrapbookService) {}

  /**
   * Get the full scrapbook tree
   */
  @Get('tree')
  async getTree(@Param('projectName') projectName: string): Promise<any> {
    return this.scrapbookService.getTree(projectName);
  }

  /**
   * Get all nodes as a flat list
   */
  @Get('nodes')
  async getAllNodes(@Param('projectName') projectName: string): Promise<ScrapbookNode[]> {
    return this.scrapbookService.getAllNodes(projectName);
  }

  /**
   * Get a single node by ID
   */
  @Get('nodes/:nodeId')
  async getNode(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
  ): Promise<ScrapbookNode> {
    const node = await this.scrapbookService.getNode(projectName, nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }
    return node;
  }

  /**
   * Get children of a node
   */
  @Get('nodes/:nodeId/children')
  async getChildren(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
  ): Promise<ScrapbookNode[]> {
    return this.scrapbookService.getChildren(projectName, nodeId);
  }

  /**
   * Create a new node
   */
  @Post('nodes')
  @HttpCode(HttpStatus.CREATED)
  async createNode(
    @Param('projectName') projectName: string,
    @Body() dto: CreateNodeDto,
  ): Promise<ScrapbookNode> {
    return this.scrapbookService.createNode(
      projectName,
      {
        type: dto.type as any,
        label: dto.label,
        description: dto.description,
        priority: dto.priority,
        attentionWeight: dto.attentionWeight,
        iconName: dto.iconName,
      },
      dto.parentId,
    );
  }

  /**
   * Update a node
   */
  @Put('nodes/:nodeId')
  async updateNode(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ): Promise<ScrapbookNode> {
    return this.scrapbookService.updateNode(projectName, nodeId, dto);
  }

  /**
   * Delete a node (and all descendants)
   */
  @Delete('nodes/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNode(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.scrapbookService.deleteNode(projectName, nodeId);
  }

  /**
   * Get canvas settings (zoom, viewport, node positions)
   */
  @Get('canvas')
  async getCanvasSettings(@Param('projectName') projectName: string): Promise<CanvasSettings | null> {
    return this.scrapbookService.loadCanvasSettings(projectName);
  }

  /**
   * Save canvas settings
   */
  @Post('canvas')
  @HttpCode(HttpStatus.OK)
  async saveCanvasSettings(
    @Param('projectName') projectName: string,
    @Body() settings: CanvasSettings,
  ): Promise<{ success: boolean }> {
    await this.scrapbookService.saveCanvasSettings(projectName, settings);
    return { success: true };
  }

  /**
   * Upload an image for a node
   */
  @Post('nodes/:nodeId/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ filename: string }> {
    const filename = await this.scrapbookService.uploadImage(
      projectName,
      nodeId,
      file.originalname,
      file.buffer,
    );
    return { filename };
  }

  /**
   * Get an image file
   */
  @Get('images/:filename')
  async getImage(
    @Param('projectName') projectName: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const workspaceDir = process.env.WORKSPACE_ROOT || path.join(process.cwd(), '..', 'workspace');
    const imagePath = path.join(workspaceDir, projectName, 'scrapbook', 'images', filename);

    if (!await fs.pathExists(imagePath)) {
      throw new Error('Image not found');
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    res.set({
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    });

    const file = fs.createReadStream(imagePath);
    return new StreamableFile(file);
  }

  /**
   * Delete an image from a node
   */
  @Delete('nodes/:nodeId/images/:filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Param('projectName') projectName: string,
    @Param('nodeId') nodeId: string,
    @Param('filename') filename: string,
  ): Promise<void> {
    await this.scrapbookService.deleteImage(projectName, nodeId, filename);
  }

  /**
   * Initialize with example data (Building a House)
   */
  @Post('example-data')
  @HttpCode(HttpStatus.CREATED)
  async initializeExampleData(@Param('projectName') projectName: string): Promise<ScrapbookNode> {
    return this.scrapbookService.initializeExampleData(projectName);
  }

  /**
   * Get markdown description of the scrapbook
   */
  @Get('describe')
  async describe(@Param('projectName') projectName: string): Promise<{ markdown: string }> {
    const markdown = await this.scrapbookService.describeScrapbook(projectName);
    return { markdown };
  }

  /**
   * Get markdown description of a specific category
   */
  @Get('describe/:categoryName')
  async describeCategory(
    @Param('projectName') projectName: string,
    @Param('categoryName') categoryName: string,
  ): Promise<{ markdown: string }> {
    const markdown = await this.scrapbookService.describeScrapbook(projectName, categoryName);
    return { markdown };
  }
}
