import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ComplianceService,
  CreateReleaseDto,
  ReleaseCommentDto,
  DeleteReleaseCommentDto,
} from './compliance.service';

@Controller('api/compliance')
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * GET /api/compliance/guideline
   * Returns the compliance guideline markdown document
   */
  @Get('guideline')
  async getGuideline() {
    try {
      const content = await this.complianceService.getGuideline();
      return { content };
    } catch (error: any) {
      throw new HttpException(
        { message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/compliance/:project/status
   * Returns compliance status for a project
   */
  @Get(':project/status')
  async getStatus(@Param('project') project: string) {
    try {
      return await this.complianceService.getStatus(project);
    } catch (error: any) {
      throw new HttpException(
        { message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/compliance/:project/release-comments
   * Returns all release comments for a project
   */
  @Get(':project/release-comments')
  async getReleaseComments(@Param('project') project: string) {
    try {
      return await this.complianceService.readReleaseComments(project);
    } catch (error: any) {
      throw new HttpException(
        { message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/compliance/:project/release-comments
   * Save/update a release comment for a file
   */
  @Post(':project/release-comments')
  async saveReleaseComment(
    @Param('project') project: string,
    @Body() dto: ReleaseCommentDto,
  ) {
    try {
      await this.complianceService.saveReleaseComment(project, dto.path, dto.comment);
      return { success: true };
    } catch (error: any) {
      throw new HttpException(
        { message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /api/compliance/:project/release-comments
   * Delete a release comment for a file
   */
  @Delete(':project/release-comments')
  async deleteReleaseComment(
    @Param('project') project: string,
    @Body() dto: DeleteReleaseCommentDto,
  ) {
    try {
      await this.complianceService.deleteReleaseComment(project, dto.path);
      return { success: true };
    } catch (error: any) {
      throw new HttpException(
        { message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/compliance/:project/release
   * Create a compliance release
   */
  @Post(':project/release')
  async createRelease(
    @Param('project') project: string,
    @Body() dto: CreateReleaseDto,
  ) {
    try {
      this.logger.log(`Creating release for project ${project}`);
      const release = await this.complianceService.createRelease(project, dto);
      return { success: true, release };
    } catch (error: any) {
      this.logger.error(`Release creation failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
