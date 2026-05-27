import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult } from './rag.service';

export interface Bm25Chunk {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

@Injectable()
export class Bm25Service implements OnModuleDestroy {
  private readonly logger = new Logger(Bm25Service.name);
  private readonly workspaceDir = process.env.RAG_WORKSPACE_DIR
    || path.join(process.cwd(), '..', 'workspace');
  private readonly dbs = new Map<string, Database.Database>();
  private readonly ensuredTables = new Set<string>();

  private resolveDbPath(project: string): string {
    const projectDir = path.join(this.workspaceDir, project, 'knowledge-graph');
    fs.mkdirSync(projectDir, { recursive: true });
    return path.join(projectDir, 'bm25.sqlite');
  }

  private getDb(project: string): Database.Database {
    const existing = this.dbs.get(project);
    if (existing) return existing;
    const db = new Database(this.resolveDbPath(project));
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    this.dbs.set(project, db);
    return db;
  }

  private ensureTable(project: string, ftsTable: string): Database.Database {
    const key = `${project}/${ftsTable}`;
    const db = this.getDb(project);
    if (this.ensuredTables.has(key)) return db;

    // FTS5 virtual table with multilingual-safe tokenizer (no English stemming).
    // chunk_id is UNINDEXED — it's a string we store but never search by MATCH;
    // we filter by document_id via a separate WHERE clause.
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS "${ftsTable}" USING fts5(
        content,
        filepath UNINDEXED,
        scope UNINDEXED,
        document_id UNINDEXED,
        chunk_id UNINDEXED,
        wiki_slug,
        wiki_title,
        tokenize = 'unicode61 remove_diacritics 2'
      )`,
    );
    this.ensuredTables.add(key);
    return db;
  }

  /**
   * Insert chunks into the BM25 index for a (project, ftsTable) pair.
   * Wraps inserts in a single transaction to amortize per-row cost.
   */
  indexChunks(project: string, ftsTable: string, chunks: Bm25Chunk[]): void {
    if (chunks.length === 0) return;
    const db = this.ensureTable(project, ftsTable);

    const stmt = db.prepare(
      `INSERT INTO "${ftsTable}" (content, filepath, scope, document_id, chunk_id, wiki_slug, wiki_title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertMany = db.transaction((rows: Bm25Chunk[]) => {
      for (const row of rows) {
        const md = row.metadata || {};
        stmt.run(
          row.content,
          md.filepath ?? null,
          md.scope ?? null,
          md.documentId ?? null,
          row.id,
          md.wikiSlug ?? null,
          md.wikiTitle ?? null,
        );
      }
    });
    insertMany(chunks);
  }

  /**
   * Delete all rows for a documentId. Returns the number of rows removed.
   */
  removeByDocumentId(project: string, ftsTable: string, documentId: string): number {
    const db = this.ensureTable(project, ftsTable);
    const stmt = db.prepare(`DELETE FROM "${ftsTable}" WHERE document_id = ?`);
    const result = stmt.run(documentId);
    return Number(result.changes ?? 0);
  }

  /**
   * BM25-ranked search. Returns SearchResult[] symmetric with Chroma's shape so
   * the fuser can mix the two.
   *
   * Query sanitization: FTS5 has operators (AND, OR, NOT, NEAR, ", *, :) that
   * blow up on raw user input. Strip them, split on whitespace, quote each
   * term, append `*` for prefix matching, then OR them together.
   */
  search(
    project: string,
    ftsTable: string,
    query: string,
    topK: number,
    filepaths?: string[],
  ): SearchResult[] {
    const matchQuery = this.buildMatchQuery(query);
    if (!matchQuery) return [];

    let db: Database.Database;
    try {
      db = this.ensureTable(project, ftsTable);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`BM25 ensureTable failed for ${project}/${ftsTable}: ${message}`);
      return [];
    }

    const params: any[] = [matchQuery];
    let sql = `SELECT chunk_id, content, filepath, scope, document_id, bm25("${ftsTable}") AS rank
               FROM "${ftsTable}"
               WHERE "${ftsTable}" MATCH ?`;
    if (filepaths && filepaths.length > 0) {
      const placeholders = filepaths.map(() => '?').join(',');
      sql += ` AND filepath IN (${placeholders})`;
      params.push(...filepaths);
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(topK);

    let rows: any[];
    try {
      rows = db.prepare(sql).all(...params) as any[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`BM25 search failed for ${project}/${ftsTable}: ${message}`);
      return [];
    }

    return rows.map((row) => ({
      id: row.chunk_id,
      content: row.content ?? '',
      // FTS5 bm25() returns more-negative for better matches. Flip sign so a
      // larger similarity = better match, matching the dense side's semantics.
      similarity: -Number(row.rank),
      metadata: {
        filepath: row.filepath,
        scope: row.scope,
        documentId: row.document_id,
      },
    }));
  }

  /**
   * Sanitize a raw user query into a safe FTS5 MATCH expression.
   * - Drops FTS5 operators and quote characters.
   * - Splits on whitespace.
   * - Quotes each remaining term (so unicode61 token boundaries don't matter)
   *   and appends `*` for prefix matching.
   * - Joins terms with OR so any token can match.
   *
   * Returns null if no usable tokens remain.
   */
  private buildMatchQuery(query: string): string | null {
    if (!query) return null;
    // Strip FTS5 reserved chars / operators. Keep letters, digits, hyphens,
    // underscores, dots (for identifiers like foo.bar).
    const cleaned = query
      .replace(/["()*:^]/g, ' ')
      .replace(/\b(AND|OR|NOT|NEAR)\b/g, ' ')
      .trim();
    if (!cleaned) return null;

    const terms = cleaned
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => `"${t.replace(/"/g, '')}"*`);

    if (terms.length === 0) return null;
    return terms.join(' OR ');
  }

  onModuleDestroy(): void {
    for (const [project, db] of this.dbs) {
      try {
        db.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close BM25 DB for ${project}: ${message}`);
      }
    }
    this.dbs.clear();
    this.ensuredTables.clear();
  }
}
