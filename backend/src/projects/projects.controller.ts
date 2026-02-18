import { Controller, Post, Get, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Get list of projects that have UI customization
   */
  @Get('with-ui-config')
  async getProjectsWithUIConfig() {
    const projects = await this.projectsService.getProjectsWithUIConfig();
    return { projects };
  }

  /**
   * Generate an agent name from custom role content using LLM
   */
  @Post('generate-agent-name')
  @Roles('user')
  async generateAgentName(@Body() body: { customRoleContent: string }) {
    const agentName = await this.projectsService.generateAgentName(body.customRoleContent);
    return { agentName };
  }

  /**
   * Create a new project with full configuration
   */
  @Post('create')
  @Roles('user')
  async createProject(@Body() dto: CreateProjectDto) {
    // Validate project name
    if (!/^[a-z0-9-]+$/.test(dto.projectName)) {
      throw new HttpException(
        {
          success: false,
          message: 'Project name can only contain lowercase letters, numbers, and hyphens',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.projectName.length > 30) {
      throw new HttpException(
        {
          success: false,
          message: 'Project name must be 30 characters or less',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.projectsService.createProject(dto);

    if (!result.success) {
      throw new HttpException(
        {
          success: false,
          message: result.errors?.[0] || 'Failed to create project',
          errors: result.errors,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
