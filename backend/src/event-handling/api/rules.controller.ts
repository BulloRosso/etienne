import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Logger,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreateRuleDto, UpdateRuleDto } from '../dto/create-rule.dto';
import { RuleEngineService } from '../core/rule-engine.service';
import { EventRule } from '../interfaces/event.interface';
import { randomUUID } from 'crypto';

@Controller('api/rules')
export class RulesController {
  private readonly logger = new Logger(RulesController.name);

  constructor(private readonly ruleEngine: RuleEngineService) {}

  /**
   * GET /api/rules/:project - List all rules
   */
  @Get(':project')
  async getRules(@Param('project') projectName: string) {
    try {
      // Load rules from config if not already loaded
      await this.ruleEngine.loadRules(projectName);

      const rules = this.ruleEngine.getAllRules();

      return {
        success: true,
        count: rules.length,
        rules,
      };
    } catch (error) {
      this.logger.error('Failed to get rules', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/rules/:project/:ruleId - Get a specific rule
   */
  @Get(':project/:ruleId')
  async getRule(@Param('project') projectName: string, @Param('ruleId') ruleId: string) {
    try {
      await this.ruleEngine.loadRules(projectName);

      const rule = this.ruleEngine.getRule(ruleId);

      if (!rule) {
        return {
          success: false,
          error: 'Rule not found',
        };
      }

      return {
        success: true,
        rule,
      };
    } catch (error) {
      this.logger.error('Failed to get rule', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /api/rules/:project - Create a new rule
   */
  @Post(':project')
  async createRule(
    @Param('project') projectName: string,
    @Body(ValidationPipe) dto: CreateRuleDto,
  ) {
    try {
      await this.ruleEngine.loadRules(projectName);

      const rule: EventRule = {
        id: randomUUID(),
        name: dto.name,
        enabled: dto.enabled ?? true,
        condition: dto.condition,
        action: dto.action,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.ruleEngine.addRule(rule);
      await this.ruleEngine.saveRules(projectName);

      this.logger.log(`Created rule: ${rule.name} (${rule.id}) for project ${projectName}`);

      return {
        success: true,
        rule,
      };
    } catch (error) {
      this.logger.error('Failed to create rule', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * PUT /api/rules/:project/:ruleId - Update a rule
   */
  @Put(':project/:ruleId')
  async updateRule(
    @Param('project') projectName: string,
    @Param('ruleId') ruleId: string,
    @Body(ValidationPipe) dto: UpdateRuleDto,
  ) {
    try {
      await this.ruleEngine.loadRules(projectName);

      const updatedRule = this.ruleEngine.updateRule(ruleId, dto);

      if (!updatedRule) {
        return {
          success: false,
          error: 'Rule not found',
        };
      }

      await this.ruleEngine.saveRules(projectName);

      this.logger.log(`Updated rule: ${updatedRule.name} (${ruleId}) for project ${projectName}`);

      return {
        success: true,
        rule: updatedRule,
      };
    } catch (error) {
      this.logger.error('Failed to update rule', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * DELETE /api/rules/:project/:ruleId - Delete a rule
   */
  @Delete(':project/:ruleId')
  @HttpCode(HttpStatus.OK)
  async deleteRule(@Param('project') projectName: string, @Param('ruleId') ruleId: string) {
    try {
      await this.ruleEngine.loadRules(projectName);

      const deleted = this.ruleEngine.deleteRule(ruleId);

      if (!deleted) {
        return {
          success: false,
          error: 'Rule not found',
        };
      }

      await this.ruleEngine.saveRules(projectName);

      this.logger.log(`Deleted rule: ${ruleId} for project ${projectName}`);

      return {
        success: true,
        message: 'Rule deleted successfully',
      };
    } catch (error) {
      this.logger.error('Failed to delete rule', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/rules/:project/groups - Get available event groups
   */
  @Get(':project/groups')
  async getEventGroups(@Param('project') projectName: string) {
    try {
      const groups = this.ruleEngine.getEventGroups();

      return {
        success: true,
        groups,
      };
    } catch (error) {
      this.logger.error('Failed to get event groups', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
