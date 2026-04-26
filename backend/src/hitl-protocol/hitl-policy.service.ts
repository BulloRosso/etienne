import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  HITLProjectConfig,
  VerificationPolicy,
  PolicyEvaluation,
  VerificationPolicyLevel,
} from './interfaces/hitl-protocol.interface';

const DEFAULT_CONFIG: HITLProjectConfig = {
  enabled: true,
  default_policy: 'required',
  timeout_ms: 300_000,
  action_overrides: [],
  step_up_criteria: [],
  allowed_services: [],
  delivery_channels: ['web'],
};

@Injectable()
export class HitlPolicyService {
  private readonly logger = new Logger(HitlPolicyService.name);
  private readonly workspaceRoot: string;

  constructor() {
    this.workspaceRoot =
      process.env.WORKSPACE_ROOT ??
      process.env.WORKSPACE_HOST_ROOT ??
      'C:/Data/GitHub/claude-multitenant/workspace';
  }

  /**
   * Load the HITL configuration for a project.
   * Falls back: project → workspace-wide → env vars → defaults.
   */
  async getProjectConfig(project: string): Promise<HITLProjectConfig> {
    // Try project-level config
    const projectConfigPath = path.join(
      this.workspaceRoot,
      project,
      '.claude',
      'hitl-config.json',
    );
    const projectConfig = await this.loadConfigFile(projectConfigPath);
    if (projectConfig) return projectConfig;

    // Try workspace-wide config
    const workspaceConfigPath = path.join(
      this.workspaceRoot,
      '.agent',
      'hitl-config.json',
    );
    const workspaceConfig = await this.loadConfigFile(workspaceConfigPath);
    if (workspaceConfig) return workspaceConfig;

    // Fall back to env vars + defaults
    return {
      ...DEFAULT_CONFIG,
      enabled: (process.env.HITL_ENABLED ?? 'true') !== 'false',
      default_policy: (process.env.HITL_DEFAULT_POLICY as VerificationPolicyLevel) || DEFAULT_CONFIG.default_policy,
      timeout_ms: Number(process.env.HITL_DEFAULT_TIMEOUT_MS) || DEFAULT_CONFIG.timeout_ms,
    };
  }

  /**
   * Evaluate the effective policy for a specific action type in a project.
   */
  async evaluatePolicy(
    project: string,
    actionType: string,
    requestedPolicy: VerificationPolicyLevel,
  ): Promise<PolicyEvaluation> {
    const config = await this.getProjectConfig(project);

    if (!config.enabled) {
      return {
        effective_policy: 'optional',
        requires_human_review: false,
        reason: 'HITL is disabled for this project',
      };
    }

    // Check action-specific overrides first
    const override = config.action_overrides.find(
      (o) => o.action_type === actionType,
    );
    if (override) {
      const policy = override.policy as VerificationPolicyLevel;
      return {
        effective_policy: policy,
        requires_human_review: policy === 'required',
        reason: `Action override for "${actionType}"`,
      };
    }

    // For step_up_only, check step-up criteria
    if (requestedPolicy === 'step_up_only') {
      for (const criterion of config.step_up_criteria) {
        const regex = new RegExp(criterion.pattern, 'i');
        if (regex.test(actionType)) {
          return {
            effective_policy: 'required',
            requires_human_review: true,
            step_up_criteria_matched: criterion.pattern,
            reason: `Step-up criterion matched: "${criterion.pattern}"`,
          };
        }
      }
      // No step-up criteria matched → treat as optional
      return {
        effective_policy: 'optional',
        requires_human_review: false,
        reason: 'No step-up criteria matched; treating as optional',
      };
    }

    // Use the stricter of requested policy vs project default
    const effective = this.stricterPolicy(requestedPolicy, config.default_policy);
    return {
      effective_policy: effective,
      requires_human_review: effective === 'required',
      reason: `Effective policy from request (${requestedPolicy}) and project default (${config.default_policy})`,
    };
  }

  /**
   * Get the full verification policy for agent preflight / detection.
   */
  async getVerificationPolicy(project: string): Promise<VerificationPolicy> {
    const config = await this.getProjectConfig(project);
    return {
      default_policy: config.default_policy,
      action_overrides: config.action_overrides,
      step_up_criteria: config.step_up_criteria,
      supported_platforms: config.delivery_channels,
    };
  }

  /**
   * Check whether a service ID is allowed for a project.
   */
  async isServiceAllowed(project: string, serviceId: string): Promise<boolean> {
    const config = await this.getProjectConfig(project);
    // Empty allowed_services list means all services are allowed
    if (!config.allowed_services || config.allowed_services.length === 0) {
      return true;
    }
    return config.allowed_services.some((pattern) => {
      if (pattern.endsWith('*')) {
        return serviceId.startsWith(pattern.slice(0, -1));
      }
      return serviceId === pattern;
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async loadConfigFile(
    filePath: string,
  ): Promise<HITLProjectConfig | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return null;
    }
  }

  private stricterPolicy(
    a: VerificationPolicyLevel,
    b: VerificationPolicyLevel,
  ): VerificationPolicyLevel {
    const rank: Record<VerificationPolicyLevel, number> = {
      optional: 0,
      step_up_only: 1,
      required: 2,
    };
    return rank[a] >= rank[b] ? a : b;
  }
}
