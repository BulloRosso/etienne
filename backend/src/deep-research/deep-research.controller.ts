import { Controller, Post, Get, Param, Body, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { DeepResearchService } from './deep-research.service';
import { StartResearchDto } from './dto/start-research.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('api/deep-research')
export class DeepResearchController {
  constructor(private readonly deepResearchService: DeepResearchService) {}

  @Roles('user')
  @Post(':project/start')
  async startResearch(
    @Param('project') project: string,
    @Body() dto: StartResearchDto,
  ) {
    const result = await this.deepResearchService.startResearch(
      project,
      dto.inputFile,
      dto.outputFile,
    );
    return {
      success: true,
      ...result,
    };
  }

  @Sse(':project/stream')
  streamResearch(@Param('project') project: string): Observable<MessageEvent> {
    console.log(`[DeepResearchController] SSE stream requested for project: ${project}`);
    return this.deepResearchService.getEventStream(project).pipe(
      map((event) => {
        console.log(`[DeepResearchController] Mapping event ${event.type} for SSE`);
        // SSE data must be a string (JSON.stringify the data object)
        return {
          type: event.type,
          data: JSON.stringify(event.data),
        } as any;
      }),
    );
  }

  @Get(':project/sessions')
  async getSessions(@Param('project') project: string) {
    const sessions = await this.deepResearchService.getSessions(project);
    return {
      success: true,
      sessions,
    };
  }

  @Get(':project/file-exists/:fileName(*)')
  async checkFileExists(
    @Param('project') project: string,
    @Param('fileName') fileName: string,
  ) {
    const exists = await this.deepResearchService.checkFileExists(project, fileName);
    return {
      exists,
    };
  }
}
