import { Controller, Get, Param, Query } from '@nestjs/common';
import { BusLoggerService } from './bus-logger.service';
import { BusLogEntry, ServiceName } from './interfaces/bus-messages';

@Controller('api/agent-bus')
export class AgentBusController {
  constructor(private readonly busLogger: BusLoggerService) {}

  /**
   * GET /api/agent-bus/:project/trace/:correlationId
   * Returns all log entries from CMS, DSS, and SWE for a correlationId, sorted by timestamp.
   */
  @Get(':project/trace/:correlationId')
  async getTrace(
    @Param('project') project: string,
    @Param('correlationId') correlationId: string,
  ): Promise<BusLogEntry[]> {
    return this.busLogger.getTrace(project, correlationId);
  }

  /**
   * GET /api/agent-bus/:project/traces?limit=50
   * Returns recent correlationIds with a summary of the chain.
   */
  @Get(':project/traces')
  async getRecentTraces(
    @Param('project') project: string,
    @Query('limit') limit?: string,
  ) {
    return this.busLogger.getRecentTraces(project, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * GET /api/agent-bus/:project/logs/:service?limit=50
   * Returns recent log entries for a specific service.
   */
  @Get(':project/logs/:service')
  async getServiceLogs(
    @Param('project') project: string,
    @Param('service') service: string,
    @Query('limit') limit?: string,
  ): Promise<BusLogEntry[]> {
    const validServices: ServiceName[] = ['cms', 'dss', 'swe'];
    const svc = service as ServiceName;
    if (!validServices.includes(svc)) {
      return [];
    }
    return this.busLogger.getRecentEntries(project, svc, limit ? parseInt(limit, 10) : 50);
  }
}
