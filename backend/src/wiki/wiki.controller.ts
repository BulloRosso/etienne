import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { Classification, Provenance, WikiPage } from '../memory/types';
import { WikiService, type WikiBucket, type WikiPageSummary } from './wiki.service';

/**
 * REST entry point onto the per-project wiki. Reads go through the service's
 * direct-fs path; writes/deletes go through the wiki skill's `tsx` scripts.
 *
 * NOTE: This controller is unguarded by the firewall — the Adaptive-Memory
 * writeback tool validates classification before invoking the service. UIs
 * that POST here directly are expected to set `classification` themselves
 * (defaulting to 'private' when unknown).
 */
@Controller('api/wiki/:project')
export class WikiController {
  constructor(private readonly wiki: WikiService) {}

  @Get('pages')
  @Roles('user')
  async list(
    @Param('project') project: string,
    @Query('bucket') bucket?: WikiBucket,
    @Query('tag') tag?: string,
    @Query('classification') classification?: Classification,
  ): Promise<WikiPageSummary[]> {
    return this.wiki.listPages(project, { bucket, tag, classification });
  }

  @Get('pages/:slug')
  @Roles('user')
  async get(
    @Param('project') project: string,
    @Param('slug') slug: string,
  ): Promise<WikiPage> {
    const page = await this.wiki.getPage(project, slug);
    if (!page) {
      throw new HttpException(`page not found: ${slug}`, HttpStatus.NOT_FOUND);
    }
    return page;
  }

  @Post('pages')
  @Roles('user')
  async put(
    @Param('project') project: string,
    @Body()
    body: {
      title: string;
      slug?: string;
      bucket?: WikiBucket;
      body: string;
      tags?: string[];
      status?: 'stub' | 'draft' | 'stable';
      confidence?: 'high' | 'medium' | 'low';
      mission_relevance?: number;
      sources: Array<
        | { kind: 'conversation'; turn: string; note?: string }
        | { kind: 'file'; path: string; lines?: string }
      >;
      classification: Classification;
      provenance: Provenance;
      supersedes?: string[];
      aliases?: string[];
      mode?: 'create' | 'update';
    },
  ): Promise<{ slug: string; path: string; mode: 'create' | 'update' }> {
    try {
      return await this.wiki.putPage(project, body);
    } catch (err: any) {
      throw new HttpException(
        `wiki putPage failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('pages/:slug')
  @Roles('user')
  async delete(
    @Param('project') project: string,
    @Param('slug') slug: string,
    @Query('bucket') bucket?: WikiBucket,
    @Query('reason') reason?: string,
  ): Promise<{ slug: string; bucket: WikiBucket; noop: boolean }> {
    try {
      return await this.wiki.deletePage(project, slug, { bucket, reason });
    } catch (err: any) {
      throw new HttpException(
        `wiki delete failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search')
  @Roles('user')
  async search(
    @Param('project') project: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<Array<{ slug: string; bucket: WikiBucket; score: number }>> {
    const keywords = (q ?? '')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return this.wiki.search(project, keywords, {
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
