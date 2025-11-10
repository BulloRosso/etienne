import { IsString, IsOptional, IsObject, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum EntityType {
  Person = 'Person',
  Firma = 'Firma',
  Produkt = 'Produkt'
}

export class CreateDocumentDto {
  @ApiProperty({ description: 'Unique identifier for the document' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Markdown content to be embedded' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Optional entity ID to link to', required: false })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiProperty({ description: 'Optional entity type', enum: EntityType, required: false })
  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class CreateEntityDto {
  @ApiProperty({ description: 'Unique identifier for the entity' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Entity type', enum: EntityType })
  @IsEnum(EntityType)
  type: EntityType;

  @ApiProperty({ description: 'Entity properties' })
  @IsObject()
  properties: { [key: string]: string };
}

export class CreateRelationshipDto {
  @ApiProperty({ description: 'Subject entity ID' })
  @IsString()
  subject: string;

  @ApiProperty({ description: 'Predicate/relationship type' })
  @IsString()
  predicate: string;

  @ApiProperty({ description: 'Object entity ID' })
  @IsString()
  object: string;

  @ApiProperty({ description: 'Additional relationship properties', required: false })
  @IsOptional()
  @IsObject()
  properties?: { [key: string]: string };
}

export class SearchQueryDto {
  @ApiProperty({ description: 'Natural language search query' })
  @IsString()
  query: string;

  @ApiProperty({ description: 'Number of results to return', required: false, default: 5 })
  @IsOptional()
  @IsNumber()
  topK?: number = 5;

  @ApiProperty({ description: 'Whether to include vector search results', required: false, default: true })
  @IsOptional()
  includeVectorSearch?: boolean = true;

  @ApiProperty({ description: 'Whether to include knowledge graph search', required: false, default: true })
  @IsOptional()
  includeKnowledgeGraph?: boolean = true;
}

export class SparqlQueryDto {
  @ApiProperty({ description: 'SPARQL query string' })
  @IsString()
  query: string;
}

export class VectorSearchDto {
  @ApiProperty({ description: 'Query text for vector search' })
  @IsString()
  query: string;

  @ApiProperty({ description: 'Number of results to return', required: false, default: 5 })
  @IsOptional()
  @IsNumber()
  topK?: number = 5;

  @ApiProperty({ description: 'Filter criteria', required: false })
  @IsOptional()
  @IsObject()
  filter?: any;
}

export class HybridSearchResult {
  @ApiProperty({ description: 'Search results from vector database' })
  vectorResults: {
    id: string;
    content: string;
    similarity: number;
    metadata: any;
  }[];

  @ApiProperty({ description: 'Search results from knowledge graph' })
  knowledgeGraphResults: any[];

  @ApiProperty({ description: 'Combined and ranked results' })
  combinedResults: any[];

  @ApiProperty({ description: 'Generated SPARQL query' })
  sparqlQuery?: string;
}
