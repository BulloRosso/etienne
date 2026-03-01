import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { IssuesService } from './issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import {
  RejectIssueDto,
  UpdatePriorityDto,
  AddCommentDto,
  SetAutonomyLevelDto,
} from './dto/update-issue.dto';

@Controller('api/issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  /**
   * Get autonomy level configuration
   * MUST be before :project/:id to avoid route conflict
   */
  @Get(':project/config/autonomy')
  @Roles('admin')
  async getAutonomyLevel(@Param('project') project: string) {
    try {
      const config = await this.issuesService.getAutonomyLevel(project);
      return { success: true, config };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Set autonomy level configuration (admin only)
   * MUST be before :project/:id to avoid route conflict
   */
  @Patch(':project/config/autonomy')
  @Roles('admin')
  async setAutonomyLevel(
    @Param('project') project: string,
    @Body() dto: SetAutonomyLevelDto,
  ) {
    try {
      const config = await this.issuesService.setAutonomyLevel(project, dto.level);
      return { success: true, config };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Create a new issue (user or admin)
   */
  @Post(':project')
  @Roles('user')
  async createIssue(
    @Param('project') project: string,
    @Body() dto: CreateIssueDto,
    @Req() req: Request,
  ) {
    try {
      const user = (req as any).user;
      const issue = await this.issuesService.createIssue(project, dto, user.username);
      return { success: true, issue };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * List issues — user sees own issues, admin sees all
   */
  @Get(':project')
  @Roles('user')
  async listIssues(@Param('project') project: string, @Req() req: Request) {
    try {
      const user = (req as any).user;
      const issues = await this.issuesService.listIssues(project, user.username, user.role);
      return { success: true, issues };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a single issue by ID
   */
  @Get(':project/:id')
  @Roles('user')
  async getIssue(@Param('project') project: string, @Param('id') id: string) {
    try {
      const issue = await this.issuesService.getIssue(project, id);
      if (!issue) {
        throw new HttpException(
          { success: false, message: 'Issue not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return { success: true, issue };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Approve an issue (admin only)
   */
  @Patch(':project/:id/approve')
  @Roles('admin')
  async approveIssue(
    @Param('project') project: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    try {
      const user = (req as any).user;
      const issue = await this.issuesService.approveIssue(project, id, user.username);
      return { success: true, issue };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Reject an issue (admin only)
   */
  @Patch(':project/:id/reject')
  @Roles('admin')
  async rejectIssue(
    @Param('project') project: string,
    @Param('id') id: string,
    @Body() dto: RejectIssueDto,
    @Req() req: Request,
  ) {
    try {
      const user = (req as any).user;
      const issue = await this.issuesService.rejectIssue(project, id, user.username, dto.reason);
      return { success: true, issue };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Update priority/severity (admin only)
   */
  @Patch(':project/:id/priority')
  @Roles('admin')
  async updatePriority(
    @Param('project') project: string,
    @Param('id') id: string,
    @Body() dto: UpdatePriorityDto,
  ) {
    try {
      const issue = await this.issuesService.updatePriority(
        project,
        id,
        dto.severity,
        dto.priority,
      );
      return { success: true, issue };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Add a comment to an issue
   */
  @Post(':project/:id/comments')
  @Roles('user')
  async addComment(
    @Param('project') project: string,
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @Req() req: Request,
  ) {
    try {
      const user = (req as any).user;
      const role = user.role === 'admin' ? 'ADMIN' : 'USER';
      const issue = await this.issuesService.addComment(
        project,
        id,
        user.username,
        role,
        dto.content,
      );
      return { success: true, issue };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
