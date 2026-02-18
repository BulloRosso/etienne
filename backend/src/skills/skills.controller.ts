import {
  Controller, Get, Post, Delete, Param, Body, Query,
  HttpException, HttpStatus, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkillsService } from './skills.service';
import { SaveSkillDto } from './dto/skills.dto';
import { ProvisionSkillsDto } from './dto/repository-skills.dto';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  /**
   * List skills from the skill repository
   */
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

  /**
   * Provision all standard skills to a project
   */
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

  /**
   * Provision specific skills from the repository to a project
   */
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
