import { Logger } from '@nestjs/common';
import { EmbeddingsService } from '../../embeddings';
import { DreamingQueue } from '../queue/queue';
import { CandidateStrategy, DistillPayload, GroundPayload } from './stage-types';

const log = new Logger('Dreaming/DISTILL');
const CLUSTER_THRESHOLD = 0.85;
const MIN_SUPPORT = 2;
const MIN_STANDALONE_CONFIDENCE = 0.85;

/**
 * Cluster similar candidate strategies within this run, then emit GROUND jobs for each
 * cluster representative that passes the support threshold.
 */
export async function runDistill(
  payload: DistillPayload,
  parentJobId: number,
  runId: string,
  queue: DreamingQueue,
  embeddings: EmbeddingsService,
): Promise<void> {
  if (payload.candidates.length === 0) {
    log.log(`[${payload.project}] DISTILL(${payload.domain}): no candidates, skipping`);
    return;
  }

  const texts = payload.candidates.map(canonicalize);
  const vectors = await embeddings.embedBatch(texts);

  const visited = new Array(payload.candidates.length).fill(false);
  const clusters: number[][] = [];
  for (let i = 0; i < payload.candidates.length; i++) {
    if (visited[i]) continue;
    const cluster = [i];
    visited[i] = true;
    for (let j = i + 1; j < payload.candidates.length; j++) {
      if (visited[j]) continue;
      if (cosine(vectors[i], vectors[j]) >= CLUSTER_THRESHOLD) {
        visited[j] = true;
        cluster.push(j);
      }
    }
    clusters.push(cluster);
  }

  let emitted = 0;
  for (const cluster of clusters) {
    const candidates = cluster.map((i) => payload.candidates[i]);
    const support = candidates.length;
    const maxConfidence = Math.max(...candidates.map((c) => c.confidence));
    if (support < MIN_SUPPORT && maxConfidence < MIN_STANDALONE_CONFIDENCE) continue;

    const representative = mergeCluster(candidates);
    const groundPayload: GroundPayload = {
      project: payload.project,
      domain: payload.domain,
      candidate: representative,
      supportCount: support,
    };
    queue.enqueue('ground', groundPayload, { runId, domain: payload.domain, parentId: parentJobId });
    emitted++;
  }
  log.log(`[${payload.project}] DISTILL(${payload.domain}): ${payload.candidates.length} → ${clusters.length} clusters → ${emitted} GROUND jobs`);
}

function canonicalize(c: CandidateStrategy): string {
  return `${c.title}\nWHEN: ${c.when}\nDO: ${c.do}\nBECAUSE: ${c.because}`;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mergeCluster(cluster: CandidateStrategy[]): CandidateStrategy {
  const head = cluster[0];
  const evidence = Array.from(new Set(cluster.flatMap((c) => c.evidence)));
  const supportTrajectories = Array.from(new Set(cluster.flatMap((c) => c.supportTrajectories)));
  const confidence = Math.max(...cluster.map((c) => c.confidence));
  return {
    candidateId: `${head.candidateId}-merged`,
    domain: head.domain,
    title: head.title,
    when: head.when,
    do: head.do,
    because: head.because,
    evidence,
    confidence,
    supportTrajectories,
  };
}
