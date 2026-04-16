import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { RagService } from './rag.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/workspace')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Roles('user')
  @Post(':project/rag/index-document')
  async indexDocument(
    @Param('project') project: string,
    @Body() body: { documentPath: string },
  ) {
    const scopeName = `project_${project}`;
    const result = await this.ragService.indexDocument(scopeName, body.documentPath);
    return {
      success: result.success,
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      contentLength: result.contentLength,
    };
  }

  @Get(':project/rag/indexed-paths')
  async getIndexedPaths(@Param('project') project: string) {
    const scopeName = `project_${project}`;
    const paths = await this.ragService.getIndexedPaths(scopeName);
    return { paths };
  }
}
