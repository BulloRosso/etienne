import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { TtRepository } from '../graph/tt-repository';
import { TtSnapshotService } from '../graph/tt-snapshot';
import { TtEventsService } from '../events.service';
import { TtFilesService } from '../store/files.service';
import { IngestionService } from '../ingestion.service';
import { Capture, CaptureQuestion, Clarification } from '../types/tendertrace-types';

const ANSWER_TIMEOUT_MS = 15 * 60 * 1000; // spec §3.3: default 15 min → {skipped:true}

export interface AskedQuestion {
  question: string;
  options?: string[];
}

export interface AnswerSet {
  answers: Array<{ questionId: string; answer?: string; skipped?: boolean }>;
  answeredBy: string;
}

interface PendingAsk {
  resolve: (answers: CaptureQuestion[]) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Quick-Capture session state (spec §3.2 CaptureModule): a capture is created
 * from pasted text (persisted as an artifact like any other inbound document),
 * the capture pipeline runs a multi-turn agent session, and the agent's
 * ask_user tool call SUSPENDS on a promise this service resolves when the
 * answers arrive through the REST endpoint (or the timeout fires → skipped).
 * Q&A pairs are persisted as attested clarifications — never merged into
 * evidence quotes (spec §5.9 evidence integrity).
 */
@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);
  private readonly pending = new Map<string, PendingAsk>(); // `${project}:${captureId}`

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
    private readonly files: TtFilesService,
    private readonly ingestion: IngestionService,
  ) {}

  async create(
    project: string,
    pastedText: string,
    createdBy: string,
    hint?: string,
  ): Promise<Capture> {
    const captureId = await this.repository.nextKey(project, 'capture', 'C-', 4);

    // the paste is an artifact like any other inbound document (spec §11.2)
    await this.files.writeFile(project, `artifacts/pasted-${captureId}.md`, pastedText);
    const artifact = await this.ingestion.registerDocument(project, {
      text: pastedText,
      title: `Quick Capture ${captureId}${hint ? ` (${hint})` : ''}`,
      kind: 'artifact',
      artifactType: 'paste',
    });
    await this.ingestion.parseDocument(project, artifact.id);

    const capture: Capture = {
      id: captureId,
      status: 'processing',
      artifactId: artifact.id,
      createdBy,
      createdAt: new Date().toISOString(),
      questions: [],
      proposalIds: [],
    };
    await this.repository.saveCapture(project, capture);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'capture.state', { captureId, status: 'processing' });
    return capture;
  }

  async get(project: string, captureId: string): Promise<Capture | null> {
    return this.repository.getCapture(project, captureId);
  }

  /**
   * Called by the agent's ask_user tool. Stores the questions, flips the
   * capture to awaiting_answers, and suspends until answers arrive or the
   * timeout resolves everything as skipped.
   */
  async askQuestions(
    project: string,
    captureId: string,
    questions: AskedQuestion[],
  ): Promise<CaptureQuestion[]> {
    const capture = await this.repository.getCapture(project, captureId);
    if (!capture) throw new Error(`Unknown capture ${captureId}`);

    const stored: CaptureQuestion[] = questions.slice(0, 3).map((question) => ({
      id: crypto.randomBytes(4).toString('hex'),
      question: question.question,
      options: question.options ?? [],
    }));

    await this.repository.saveCapture(project, {
      ...capture,
      status: 'awaiting_answers',
      questions: stored,
    });
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'capture.question', {
      captureId,
      questions: stored,
    });

    return new Promise<CaptureQuestion[]>((resolve) => {
      const key = `${project}:${captureId}`;
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        const skipped = stored.map((question) => ({ ...question, skipped: true }));
        void this.markAnswered(project, captureId, skipped, 'timeout');
        resolve(skipped);
      }, ANSWER_TIMEOUT_MS);
      this.pending.set(key, { resolve, timeout });
    });
  }

  /** REST: submit answers; resolves the suspended ask_user promise. */
  async answer(project: string, captureId: string, input: AnswerSet): Promise<Capture> {
    const capture = await this.repository.getCapture(project, captureId);
    if (!capture) throw new Error(`Unknown capture ${captureId}`);

    const answered = capture.questions.map((question) => {
      const match = input.answers.find((answer) => answer.questionId === question.id);
      if (!match) return { ...question, skipped: true };
      return {
        ...question,
        answer: match.answer,
        skipped: match.skipped ?? !match.answer,
        answeredBy: input.answeredBy,
        answeredAt: new Date().toISOString(),
      };
    });

    await this.markAnswered(project, captureId, answered, input.answeredBy);

    const key = `${project}:${captureId}`;
    const pending = this.pending.get(key);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(key);
      pending.resolve(answered);
    } else {
      this.logger.warn(
        `Answers for ${captureId} arrived with no suspended session (backend restarted?) — stored as clarifications; re-run the capture to apply them.`,
      );
    }
    return (await this.repository.getCapture(project, captureId))!;
  }

  private async markAnswered(
    project: string,
    captureId: string,
    questions: CaptureQuestion[],
    answeredBy: string,
  ): Promise<void> {
    const capture = await this.repository.getCapture(project, captureId);
    if (!capture) return;
    await this.repository.saveCapture(project, {
      ...capture,
      status: 'processing',
      questions,
    });

    // persist attested clarifications
    for (const question of questions) {
      const clarificationId = await this.repository.nextKey(project, 'clarification', 'CLQ-', 4);
      const clarification: Clarification = {
        id: clarificationId,
        captureId,
        question: question.question,
        options: question.options,
        answer: question.answer,
        answeredBy: question.answeredBy ?? answeredBy,
        answeredAt: question.answeredAt,
        skipped: question.skipped ?? false,
      };
      await this.repository.saveClarification(project, clarification);
    }
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'capture.state', { captureId, status: 'processing' });
  }

  /** Close/abandon: pending questions become skipped, the session finalizes. */
  async close(project: string, captureId: string): Promise<void> {
    const key = `${project}:${captureId}`;
    const pending = this.pending.get(key);
    const capture = await this.repository.getCapture(project, captureId);
    if (pending && capture) {
      clearTimeout(pending.timeout);
      this.pending.delete(key);
      pending.resolve(capture.questions.map((question) => ({ ...question, skipped: true })));
    }
    if (capture && capture.status !== 'proposals_ready') {
      await this.repository.saveCapture(project, { ...capture, status: 'closed' });
      this.snapshots.invalidate(project);
      await this.events.emit(project, 'capture.state', { captureId, status: 'closed' });
    }
  }

  async finalize(
    project: string,
    captureId: string,
    proposalIds: string[],
    summary: any,
    failed = false,
  ): Promise<void> {
    const capture = await this.repository.getCapture(project, captureId);
    if (!capture) return;
    await this.repository.saveCapture(project, {
      ...capture,
      status: failed ? 'failed' : 'proposals_ready',
      proposalIds,
      summary,
    });
    try {
      await this.files.writeJson(project, `captures/${captureId}.session.json`, {
        captureId,
        finishedAt: new Date().toISOString(),
        proposalIds,
        summary,
        questions: capture.questions,
      });
    } catch (error: any) {
      this.logger.warn(`Failed to persist capture transcript: ${error.message}`);
    }
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'capture.state', {
      captureId,
      status: failed ? 'failed' : 'proposals_ready',
      proposalIds,
    });
  }
}
