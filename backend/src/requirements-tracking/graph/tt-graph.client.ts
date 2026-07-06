import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

/** JSON quad shape accepted by the extended rdf-store endpoints. */
export interface QuadInput {
  subject: string;
  predicate: string;
  object: string;
  objectType?: 'literal' | 'namedNode';
  datatype?: string;
  language?: string;
  graph?: string;
}

export interface TermOut {
  type: string;
  value: string;
  datatype?: string;
  language?: string;
}

export interface QuadOut {
  subject: TermOut;
  predicate: TermOut;
  object: TermOut;
  graph: TermOut;
}

export interface MatchPattern {
  subject?: string | null;
  predicate?: string | null;
  object?: string | null;
  objectType?: 'literal' | 'namedNode';
  datatype?: string;
  language?: string;
  /** undefined → all graphs, 'default' → default graph, IRI → that named graph */
  graph?: string;
}

/**
 * Thin client for the extended rdf-store (:7000) endpoints used by TenderTrace.
 * The existing KnowledgeGraphService keeps its own http://example.org/kg/ world;
 * this client speaks tt:/id: IRIs and named graphs.
 */
@Injectable()
export class TtGraphClient {
  private readonly logger = new Logger(TtGraphClient.name);

  async batch(project: string, ops: { dels?: QuadInput[]; puts?: QuadInput[] }): Promise<void> {
    await axios.post(`${QUADSTORE_URL}/${encodeURIComponent(project)}/batch`, {
      dels: ops.dels ?? [],
      puts: ops.puts ?? [],
    });
  }

  async put(project: string, quads: QuadInput[]): Promise<void> {
    await this.batch(project, { puts: quads });
  }

  async match(project: string, pattern: MatchPattern): Promise<QuadOut[]> {
    const response = await axios.post(
      `${QUADSTORE_URL}/${encodeURIComponent(project)}/match`,
      pattern,
    );
    return response.data.results ?? [];
  }

  async deleteGraph(project: string, graph: string): Promise<number> {
    const response = await axios.delete(
      `${QUADSTORE_URL}/${encodeURIComponent(project)}/graph`,
      { data: { graph } },
    );
    return response.data.deleted ?? 0;
  }

  async health(): Promise<boolean> {
    try {
      await axios.get(`${QUADSTORE_URL}/health`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

/** Helpers for building quads. */
export const q = {
  node(subject: string, predicate: string, object: string, graph: string): QuadInput {
    return { subject, predicate, object, objectType: 'namedNode', graph };
  },
  literal(subject: string, predicate: string, object: string, graph: string): QuadInput {
    return { subject, predicate, object, objectType: 'literal', graph };
  },
  typed(
    subject: string,
    predicate: string,
    object: string,
    datatype: string,
    graph: string,
  ): QuadInput {
    return { subject, predicate, object, objectType: 'literal', datatype, graph };
  },
  lang(
    subject: string,
    predicate: string,
    object: string,
    language: string,
    graph: string,
  ): QuadInput {
    return { subject, predicate, object, objectType: 'literal', language, graph };
  },
};
