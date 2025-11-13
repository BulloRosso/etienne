import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  CreateDocumentDto,
  CreateEntityDto,
  CreateRelationshipDto,
  SearchQueryDto,
  SparqlQueryDto,
  VectorSearchDto,
  ParseMarkdownDto
} from './search.dto';

@Controller('api/knowledge-graph/:project')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('documents')
  async createDocument(@Param('project') project: string, @Body() dto: CreateDocumentDto) {
    return this.searchService.createDocument(project, dto);
  }

  @Get('documents')
  async listDocuments(@Param('project') project: string) {
    return this.searchService.listDocuments(project);
  }

  @Get('documents/:id')
  async getDocument(@Param('project') project: string, @Param('id') id: string) {
    return this.searchService.getDocumentById(project, id);
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('project') project: string, @Param('id') id: string) {
    return this.searchService.deleteDocument(project, id);
  }

  @Post('entities')
  async createEntity(@Param('project') project: string, @Body() dto: CreateEntityDto) {
    return this.searchService.createEntity(project, dto);
  }

  @Get('entities/:id')
  async getEntity(@Param('project') project: string, @Param('id') id: string) {
    return this.searchService.getEntity(project, id);
  }

  @Get('entities')
  async getEntitiesByType(@Param('project') project: string, @Query('type') type: string) {
    return this.searchService.getEntitiesByType(project, type);
  }

  @Delete('entities/:id')
  async deleteEntity(@Param('project') project: string, @Param('id') id: string) {
    return this.searchService.deleteEntity(project, id);
  }

  @Post('relationships')
  async createRelationship(@Param('project') project: string, @Body() dto: CreateRelationshipDto) {
    return this.searchService.createRelationship(project, dto);
  }

  @Get('entities/:id/relationships')
  async getEntityRelationships(@Param('project') project: string, @Param('id') id: string) {
    return this.searchService.getEntityRelationships(project, id);
  }

  @Post('search/hybrid')
  @HttpCode(200)
  async hybridSearch(@Param('project') project: string, @Body() dto: SearchQueryDto) {
    return this.searchService.hybridSearch(project, dto);
  }

  @Post('search/vector')
  @HttpCode(200)
  async vectorSearch(@Param('project') project: string, @Body() dto: VectorSearchDto) {
    return this.searchService.vectorSearch(project, dto);
  }

  @Post('search/sparql')
  @HttpCode(200)
  async sparqlQuery(@Param('project') project: string, @Body() dto: SparqlQueryDto) {
    return this.searchService.sparqlQuery(project, dto);
  }

  @Post('translate/sparql')
  @HttpCode(200)
  async translateToSparql(@Param('project') project: string, @Body() body: { query: string }) {
    const sparqlQuery = await this.searchService.translateToSparql(body.query, project);
    return { query: sparqlQuery };
  }

  @Get('stats')
  async getStats(@Param('project') project: string) {
    return this.searchService.getStats(project);
  }

  @Post('parse-markdown')
  @HttpCode(200)
  async parseMarkdown(@Param('project') project: string, @Body() dto: ParseMarkdownDto) {
    return this.searchService.parseMarkdown(project, dto.content, dto.sourceDocument, dto.useGraphLayer);
  }

  @Get('entity-schema')
  async getEntitySchema(@Param('project') project: string) {
    return this.searchService.getEntitySchema(project);
  }

  @Post('entity-schema')
  @HttpCode(200)
  async saveEntitySchema(@Param('project') project: string, @Body() body: { schema: string }) {
    return this.searchService.saveEntitySchema(project, body.schema);
  }

  @Get('extraction-prompt')
  async getExtractionPrompt(@Param('project') project: string) {
    return this.searchService.getExtractionPrompt(project);
  }

  @Post('extraction-prompt')
  @HttpCode(200)
  async saveExtractionPrompt(@Param('project') project: string, @Body() body: { prompt: string }) {
    return this.searchService.saveExtractionPrompt(project, body.prompt);
  }
}
