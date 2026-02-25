import {
  Controller, Get, Post, Delete, Param, Body, Query, Req, Res,
  HttpException, HttpStatus, UseInterceptors, UploadedFile, StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { Response, Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkillsService } from './skills.service';
import { SaveSkillDto } from './dto/skills.dto';
import { ProvisionSkillsDto } from './dto/repository-skills.dto';
import { SkillMetadata, SkillDependencies } from './dto/skill-catalog.dto';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  // =========================================================================
  // Catalog endpoints (MUST be before :project routes)
  // =========================================================================

  @Get('catalog')
  @Roles('admin')
  async listCatalogSkills() {
    try {
      const skills = await this.skillsService.listCatalogSkills();
      return { success: true, skills };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('catalog/review/list')
  @Roles('admin')
  async listReviewRequests() {
    try {
      const requests = await this.skillsService.listReviewRequests();
      return { success: true, requests };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('catalog/review/submit')
  @Roles('user')
  @UseInterceptors(FileInterceptor('file'))
  async submitForReview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      const user = (req as any).user;
      const username = user?.username || 'unknown';
      const request = await this.skillsService.submitForReview(
        file.buffer,
        file.originalname,
        username,
      );
      return { success: true, request };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('catalog/review/:id/accept')
  @Roles('admin')
  async acceptReviewRequest(@Param('id') id: string) {
    try {
      const result = await this.skillsService.acceptReviewRequest(id);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('catalog/review/:id/download')
  @Roles('admin')
  async downloadReviewZip(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    try {
      const zipPath = this.skillsService.getReviewZipPath(id);
      await access(zipPath);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${id}.zip"`,
      });
      const file = createReadStream(zipPath);
      return new StreamableFile(file);
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: 'Review zip not found' },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Delete('catalog/review/:id')
  @Roles('admin')
  async rejectReviewRequest(@Param('id') id: string) {
    try {
      await this.skillsService.rejectReviewRequest(id);
      return { success: true, message: 'Review request rejected' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('catalog/upload')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSkillZip(
    @UploadedFile() file: Express.Multer.File,
    @Query('source') source: 'standard' | 'optional' = 'standard',
  ) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      const result = await this.skillsService.uploadSkillZip(file.buffer, source);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('catalog/:skillName/metadata')
  @Roles('admin')
  async getSkillMetadata(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
  ) {
    try {
      const metadata = await this.skillsService.getSkillMetadata(skillName, source);
      return { success: true, metadata };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('catalog/:skillName/metadata')
  @Roles('admin')
  async saveSkillMetadata(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
    @Body() body: { metadata: SkillMetadata },
  ) {
    try {
      await this.skillsService.saveSkillMetadata(skillName, source, body.metadata);
      return { success: true, message: 'Metadata saved' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('catalog/:skillName/dependencies')
  @Roles('admin')
  async getSkillDependencies(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
  ) {
    try {
      const dependencies = await this.skillsService.getSkillDependencies(skillName, source);
      return { success: true, dependencies };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('catalog/:skillName/dependencies')
  @Roles('admin')
  async saveSkillDependencies(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
    @Body() body: { dependencies: SkillDependencies },
  ) {
    try {
      await this.skillsService.saveSkillDependencies(skillName, source, body.dependencies);
      return { success: true, message: 'Dependencies saved' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('catalog/:skillName/thumbnail')
  @Public()
  async getCatalogThumbnail(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    try {
      const { path: thumbPath } = this.skillsService.getSkillThumbnailStream(skillName, source);
      await access(thumbPath);
      res.set({ 'Content-Type': 'image/png' });
      const file = createReadStream(thumbPath);
      return new StreamableFile(file);
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: 'Thumbnail not found' },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Delete('catalog/:skillName')
  @Roles('admin')
  async deleteRepositorySkill(
    @Param('skillName') skillName: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
  ) {
    try {
      await this.skillsService.deleteRepositorySkill(skillName, source);
      return { success: true, message: 'Skill deleted from repository' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================================
  // Existing endpoints (repository, provisioning)
  // =========================================================================

  @Get('repository/list')
  async listRepositorySkills(@Query('includeOptional') includeOptional?: string) {
    try {
      const include = includeOptional === 'true';
      const skills = await this.skillsService.listRepositorySkills(include);
      const isAvailable = await this.skillsService.isRepositoryAvailable();
      return {
        success: true,
        available: isAvailable,
        skills,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================================
  // Project skill endpoints (parametric :project routes MUST come last)
  // =========================================================================

  @Post(':project/provision-standard')
  @Roles('user')
  async provisionStandardSkills(@Param('project') project: string) {
    try {
      const results = await this.skillsService.provisionStandardSkills(project);
      const successCount = results.filter((r) => r.success).length;
      return {
        success: true,
        message: `Provisioned ${successCount} of ${results.length} standard skills`,
        project,
        results,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/provision')
  @Roles('user')
  async provisionSkills(
    @Param('project') project: string,
    @Body() dto: ProvisionSkillsDto,
  ) {
    try {
      const results = await this.skillsService.provisionSkillsFromRepository(
        project,
        dto.skillNames,
        dto.source,
      );
      const successCount = results.filter((r) => r.success).length;
      return {
        success: true,
        message: `Provisioned ${successCount} of ${results.length} skills`,
        project,
        results,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':project/all-skills')
  async listAllSkills(@Param('project') project: string) {
    try {
      const skills = await this.skillsService.listAllSkills(project);
      return {
        success: true,
        project,
        skills,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project')
  async listSkills(@Param('project') project: string) {
    try {
      const skills = await this.skillsService.listSkills(project);
      return {
        success: true,
        project,
        skills,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/:skillName/files')
  async listSkillFiles(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
  ) {
    try {
      const files = await this.skillsService.listSkillFiles(project, skillName);
      return { success: true, files };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/:skillName/detect-modifications')
  async detectModifications(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
  ) {
    try {
      const result = await this.skillsService.detectModifications(project, skillName);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/:skillName/thumbnail')
  @Public()
  async getProjectSkillThumbnail(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    try {
      const thumbPath = this.skillsService.getProjectSkillThumbnailPath(project, skillName);
      await access(thumbPath);
      res.set({ 'Content-Type': 'image/png' });
      const file = createReadStream(thumbPath);
      return new StreamableFile(file);
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: 'Thumbnail not found' },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Post(':project/:skillName/files/upload')
  @Roles('user')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSkillFile(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      await this.skillsService.uploadSkillFile(
        project,
        skillName,
        file.originalname,
        file.buffer,
      );
      return {
        success: true,
        message: 'File uploaded successfully',
        fileName: file.originalname,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':project/:skillName/submit-for-review')
  @Roles('user')
  async submitProjectSkillForReview(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
    @Req() req: Request,
  ) {
    try {
      const user = (req as any).user;
      const username = user?.username || 'unknown';
      const request = await this.skillsService.submitProjectSkillForReview(project, skillName, username);
      return { success: true, request };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':project/:skillName/update-from-repo')
  @Roles('user')
  async updateSkillFromRepository(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
  ) {
    try {
      await this.skillsService.updateSkillFromRepository(project, skillName);
      return { success: true, message: 'Skill updated from repository' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':project/:skillName/files/:fileName')
  @Roles('user')
  async deleteSkillFile(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
    @Param('fileName') fileName: string,
  ) {
    try {
      await this.skillsService.deleteSkillFile(project, skillName, fileName);
      return {
        success: true,
        message: 'File deleted successfully',
        fileName,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':project/:skillName')
  async getSkill(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
  ) {
    try {
      const skill = await this.skillsService.getSkill(project, skillName);
      return {
        success: true,
        project,
        skill,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Post(':project/copy')
  @Roles('user')
  async copySkill(
    @Param('project') project: string,
    @Body() dto: { fromProject: string; skillName: string },
  ) {
    try {
      const skill = await this.skillsService.copySkill(
        dto.fromProject,
        project,
        dto.skillName,
      );
      return {
        success: true,
        message: 'Skill copied successfully',
        project,
        skill,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':project')
  @Roles('user')
  async saveSkill(
    @Param('project') project: string,
    @Body() dto: SaveSkillDto,
  ) {
    try {
      const skill = await this.skillsService.saveSkill(
        project,
        dto.skillName,
        dto.content,
      );
      return {
        success: true,
        message: 'Skill saved successfully',
        project,
        skill,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':project/:skillName')
  @Roles('user')
  async deleteSkill(
    @Param('project') project: string,
    @Param('skillName') skillName: string,
  ) {
    try {
      await this.skillsService.deleteSkill(project, skillName);
      return {
        success: true,
        message: 'Skill deleted successfully',
        project,
        skillName,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
