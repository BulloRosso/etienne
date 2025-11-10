import { IsString, IsOptional, IsObject, IsNumber, IsEnum } from 'class-validator';

export enum EntityType {
  Person = 'Person',
  Company = 'Company',
  Product = 'Product',
  Document = 'Document'
}

export class CreateDocumentDto {
  @IsString()
  id: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class CreateEntityDto {
  @IsString()
  id: string;

  @IsEnum(EntityType)
  type: EntityType;

  @IsObject()
  properties: { [key: string]: string };
}

export class CreateRelationshipDto {
  @IsString()
  subject: string;

  @IsString()
  predicate: string;

  @IsString()
  object: string;

  @IsOptional()
  @IsObject()
  properties?: { [key: string]: string };
}

export class SearchQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  topK?: number = 5;

  @IsOptional()
  includeVectorSearch?: boolean = true;

  @IsOptional()
  includeKnowledgeGraph?: boolean = true;
}

export class SparqlQueryDto {
  @IsString()
  query: string;
}

export class VectorSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  topK?: number = 5;

  @IsOptional()
  @IsObject()
  filter?: any;
}

export class HybridSearchResult {
  vectorResults: {
    id: string;
    content: string;
    similarity: number;
    metadata: any;
  }[];

  knowledgeGraphResults: any[];

  combinedResults: any[];

  sparqlQuery?: string;
}

export class ParseMarkdownDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  sourceDocument?: string;
}

export interface ExtractedEntity {
  type: string;
  count: number;
  examples: string[];
}
