import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import {
  CreateDocumentDto,
  CreateEntityDto,
  CreateRelationshipDto,
  SearchQueryDto,
  VectorSearchDto,
  SparqlQueryDto,
  EntityType,
  HybridSearchResult,
} from './search.dto';

@ApiTags('search')
@Controller('api')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Dokument-Management
  @Post('documents')
  @ApiOperation({ summary: 'Erstellt ein neues Dokument mit Embedding' })
  @ApiResponse({ status: 201, description: 'Dokument erfolgreich erstellt' })
  @ApiResponse({ status: 400, description: 'Ungültige Eingabedaten' })
  async createDocument(@Body() createDocumentDto: CreateDocumentDto) {
    try {
      return await this.searchService.createDocument(createDocumentDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Entitäts-Management
  @Post('entities')
  @ApiOperation({ summary: 'Erstellt eine neue Entität im Knowledge Graph' })
  @ApiResponse({ status: 201, description: 'Entität erfolgreich erstellt' })
  async createEntity(@Body() createEntityDto: CreateEntityDto) {
    try {
      return await this.searchService.createEntity(createEntityDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('entities/:id')
  @ApiOperation({ summary: 'Holt eine Entität nach ID' })
  @ApiParam({ name: 'id', description: 'Entitäts-ID' })
  @ApiResponse({ status: 200, description: 'Entität gefunden' })
  @ApiResponse({ status: 404, description: 'Entität nicht gefunden' })
  async getEntity(@Param('id') id: string) {
    try {
      const entity = await this.searchService.getEntity(id);
      if (!entity) {
        throw new HttpException('Entität nicht gefunden', HttpStatus.NOT_FOUND);
      }
      return entity;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('entities')
  @ApiOperation({ summary: 'Holt alle Entitäten eines bestimmten Typs' })
  @ApiQuery({ name: 'type', enum: EntityType, description: 'Entitätstyp' })
  @ApiResponse({ status: 200, description: 'Entitäten erfolgreich abgerufen' })
  async getEntitiesByType(@Query('type') type: EntityType) {
    try {
      return await this.searchService.getEntitiesByType(type);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('entities/:id/relationships')
  @ApiOperation({ summary: 'Holt alle Beziehungen einer Entität' })
  @ApiParam({ name: 'id', description: 'Entitäts-ID' })
  @ApiResponse({ status: 200, description: 'Beziehungen erfolgreich abgerufen' })
  async getEntityRelationships(@Param('id') id: string) {
    try {
      return await this.searchService.getEntityRelationships(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete('entities/:id')
  @ApiOperation({ summary: 'Löscht eine Entität und alle zugehörigen Dokumente' })
  @ApiParam({ name: 'id', description: 'Entitäts-ID' })
  @ApiResponse({ status: 200, description: 'Entität erfolgreich gelöscht' })
  async deleteEntity(@Param('id') id: string) {
    try {
      return await this.searchService.deleteEntity(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Beziehungs-Management
  @Post('relationships')
  @ApiOperation({ summary: 'Erstellt eine neue Beziehung zwischen Entitäten' })
  @ApiResponse({ status: 201, description: 'Beziehung erfolgreich erstellt' })
  async createRelationship(@Body() createRelationshipDto: CreateRelationshipDto) {
    try {
      return await this.searchService.createRelationship(createRelationshipDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Such-Endpunkte
  @Post('search/hybrid')
  @ApiOperation({ summary: 'Führt eine hybride Suche durch (Vector + Knowledge Graph)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Suchergebnisse erfolgreich abgerufen',
    type: HybridSearchResult 
  })
  async hybridSearch(@Body() searchQuery: SearchQueryDto): Promise<HybridSearchResult> {
    try {
      return await this.searchService.hybridSearch(searchQuery);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('search/vector')
  @ApiOperation({ summary: 'Führt eine reine Vektorsuche durch' })
  @ApiResponse({ status: 200, description: 'Vector-Suchergebnisse erfolgreich abgerufen' })
  async vectorSearch(@Body() vectorSearchDto: VectorSearchDto) {
    try {
      return await this.searchService.vectorSearch(vectorSearchDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('search/sparql')
  @ApiOperation({ summary: 'Führt eine SPARQL-Abfrage aus' })
  @ApiResponse({ status: 200, description: 'SPARQL-Abfrage erfolgreich ausgeführt' })
  async sparqlQuery(@Body() sparqlQueryDto: SparqlQueryDto) {
    try {
      return await this.searchService.sparqlQuery(sparqlQueryDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('translate/sparql')
  @ApiOperation({ summary: 'Übersetzt natürliche Sprache in SPARQL' })
  @ApiResponse({ status: 200, description: 'SPARQL-Übersetzung erfolgreich' })
  async translateToSparql(@Body() body: { query: string }) {
    try {
      return await this.searchService.translateToSparql(body.query);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Statistiken
  @Get('stats')
  @ApiOperation({ summary: 'Holt Statistiken über Vector Store und Knowledge Graph' })
  @ApiResponse({ status: 200, description: 'Statistiken erfolgreich abgerufen' })
  async getStats() {
    try {
      return await this.searchService.getStats();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Gesundheitscheck
  @Get('health')
  @ApiOperation({ summary: 'Gesundheitscheck der Anwendung' })
  @ApiResponse({ status: 200, description: 'Anwendung läuft ordnungsgemäß' })
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        vectorStore: 'online',
        knowledgeGraph: 'online',
        openAI: 'online',
      },
    };
  }
}
