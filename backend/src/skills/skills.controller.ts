import { Controller, Get, Post, Delete, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SaveSkillDto } from './dto/skills.dto';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

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
