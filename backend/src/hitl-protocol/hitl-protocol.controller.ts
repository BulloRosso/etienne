import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { HitlProtocolService } from './hitl-protocol.service';
import { HitlPolicyService } from './hitl-policy.service';
import { HitlTokenService } from './hitl-token.service';
import {
  HITLVerificationRequest,
  HITLFrontendResponse,
  HITLDecision,
  ProofOfHuman,
} from './interfaces/hitl-protocol.interface';

/**
 * HITL Protocol v0.8 Controller
 *
 * Exposes standards-compliant endpoints for external services and agents to
 * submit verification requests, query policies, and receive decisions.
 *
 * External-facing endpoints use API key auth (X-HITL-API-Key header).
 * Frontend-facing endpoints use the existing JWT-based @Roles('user') guard.
 */
@Controller('api/hitl')
export class HitlProtocolController {
  private readonly logger = new Logger(HitlProtocolController.name);
  private readonly apiKey: string;

  constructor(
    private readonly hitlService: HitlProtocolService,
    private readonly policyService: HitlPolicyService,
    private readonly tokenService: HitlTokenService,
  ) {
    this.apiKey = process.env.HITL_API_KEY || '';
  }

  // -------------------------------------------------------------------------
  // External-facing endpoints (API key auth)
  // -------------------------------------------------------------------------

  /**
   * POST /api/hitl/verify
   * Synchronous verification — blocks until human decides or timeout.
   */
  @Post('verify')
  async verify(
    @Body() body: HITLVerificationRequest & { project: string },
    @Headers('x-hitl-api-key') apiKeyHeader: string,
  ) {
    this.validateApiKey(apiKeyHeader);
    this.validateProject(body.project);

    const allowed = await this.policyService.isServiceAllowed(
      body.project,
      body.service_id,
    );
    if (!allowed) {
      throw new HttpException(
        `Service "${body.service_id}" is not allowed for this project`,
        HttpStatus.FORBIDDEN,
      );
    }

    const { project, ...request } = body;
    return this.hitlService.verify(project, request);
  }

  /**
   * POST /api/hitl/verify/async
   * Async verification — returns request_id immediately. Decision delivered
   * via inline submit to the provided submit_url.
   */
  @Post('verify/async')
  async verifyAsync(
    @Body() body: HITLVerificationRequest & { project: string },
    @Headers('x-hitl-api-key') apiKeyHeader: string,
  ) {
    this.validateApiKey(apiKeyHeader);
    this.validateProject(body.project);

    const allowed = await this.policyService.isServiceAllowed(
      body.project,
      body.service_id,
    );
    if (!allowed) {
      throw new HttpException(
        `Service "${body.service_id}" is not allowed for this project`,
        HttpStatus.FORBIDDEN,
      );
    }

    const { project, ...request } = body;
    return this.hitlService.verifyAsync(project, request);
  }

  /**
   * GET /api/hitl/verify/:requestId
   * Poll the status of an async verification request.
   */
  @Get('verify/:requestId')
  getVerifyStatus(
    @Param('requestId') requestId: string,
    @Headers('x-hitl-api-key') apiKeyHeader: string,
  ) {
    this.validateApiKey(apiKeyHeader);

    const status = this.hitlService.getRequestStatus(requestId);
    if (!status) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }
    return status;
  }

  // -------------------------------------------------------------------------
  // Policy / agent detection endpoints (API key auth)
  // -------------------------------------------------------------------------

  /**
   * GET /api/hitl/policy/:project
   * Returns the full verification policy for agent preflight / detection.
   */
  @Get('policy/:project')
  async getProjectPolicy(
    @Param('project') project: string,
    @Headers('x-hitl-api-key') apiKeyHeader: string,
  ) {
    this.validateApiKey(apiKeyHeader);

    const config = await this.policyService.getProjectConfig(project);
    return {
      enabled: config.enabled,
      ...(await this.policyService.getVerificationPolicy(project)),
    };
  }

  /**
   * GET /api/hitl/policy/:project/:actionType
   * Returns the effective policy for a specific action type.
   */
  @Get('policy/:project/:actionType')
  async getActionPolicy(
    @Param('project') project: string,
    @Param('actionType') actionType: string,
    @Query('requested_policy') requestedPolicy: string,
    @Headers('x-hitl-api-key') apiKeyHeader: string,
  ) {
    this.validateApiKey(apiKeyHeader);

    const policy = (requestedPolicy as any) || 'required';
    return this.policyService.evaluatePolicy(project, actionType, policy);
  }

  // -------------------------------------------------------------------------
  // Frontend-facing endpoints (JWT auth)
  // -------------------------------------------------------------------------

  /**
   * POST /api/hitl/respond
   * Handle human decision from the web frontend.
   */
  @Roles('user')
  @Post('respond')
  handleResponse(@Body() response: HITLFrontendResponse) {
    this.logger.log(
      `HITL response from frontend: ${response.request_id}, decision=${response.decision}`,
    );

    const handled = this.hitlService.handleResponse(response);
    if (handled) {
      return { success: true, message: 'HITL response processed' };
    }
    return { success: false, message: 'No pending request found for this ID' };
  }

  /**
   * POST /api/hitl/submit
   * Inline submit from an external agent, authenticated via submit token.
   */
  @Post('submit')
  handleInlineSubmit(
    @Body()
    body: {
      request_id: string;
      decision: HITLDecision;
      proof_of_human: ProofOfHuman;
    },
    @Headers('authorization') authHeader: string,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new HttpException('Missing submit token', HttpStatus.UNAUTHORIZED);
    }

    const { request_id, service_id } =
      this.tokenService.validateSubmitToken(token);
    if (request_id !== body.request_id) {
      throw new HttpException(
        'Token/request mismatch',
        HttpStatus.FORBIDDEN,
      );
    }

    const handled = this.hitlService.handleInlineSubmit(
      body.request_id,
      body.decision,
      body.proof_of_human,
    );

    if (handled) {
      return { success: true, message: 'Inline submit processed' };
    }
    return { success: false, message: 'No pending request found for this ID' };
  }

  // -------------------------------------------------------------------------
  // Admin endpoints (JWT auth)
  // -------------------------------------------------------------------------

  /**
   * GET /api/hitl/pending
   * List all pending HITL requests (admin dashboard).
   */
  @Roles('user')
  @Get('pending')
  getPendingRequests() {
    return this.hitlService.getPendingRequests();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private validateApiKey(provided: string): void {
    // If no API key is configured, skip validation (development mode)
    if (!this.apiKey) return;

    if (provided !== this.apiKey) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }
  }

  private validateProject(project: string): void {
    if (!project || typeof project !== 'string' || project.includes('..')) {
      throw new HttpException('Invalid project', HttpStatus.BAD_REQUEST);
    }
  }
}
