import { Injectable, Logger } from '@nestjs/common';
import { ContentManagementService } from '../content-management/content-management.service';
import { TtFilesService } from './store/files.service';
import { TtRepository } from './graph/tt-repository';
import { TtEventsService } from './events.service';

/**
 * Document exports: markdown assembled from APPROVED data only, rendered to
 * DOCX via the existing ContentManagementService (@turbodocx/html-to-docx),
 * written under requirements-tracking/exports/. The UI opens the result
 * through the host's open-host-preview bridge.
 */
@Injectable()
export class TtExportService {
  private readonly logger = new Logger(TtExportService.name);

  constructor(
    private readonly content: ContentManagementService,
    private readonly files: TtFilesService,
    private readonly repository: TtRepository,
    private readonly events: TtEventsService,
  ) {}

  private timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  /** Render markdown → DOCX under exports/, return the project-relative path. */
  async renderDocx(project: string, markdown: string, relativePath: string): Promise<string> {
    const buffer = await this.content.exportMarkdownToDocxBuffer(markdown);
    await this.files.writeFile(project, relativePath, buffer);
    await this.events.emit(project, 'export.ready', { path: `requirements-tracking/${relativePath}` });
    return `requirements-tracking/${relativePath}`;
  }

  /**
   * Bieterfragen (spec §2 step 4): all drafted clarification questions from
   * approved AND pending extraction proposals, grouped by document/section.
   */
  async exportBieterfragen(project: string): Promise<{ path: string; questions: number }> {
    const proposals = await this.repository.listProposals(project, { kind: 'extraction' });
    const meta = await this.repository.getTenderMeta(project);

    interface Question {
      section: string;
      document: string;
      question: string;
    }
    const questions: Question[] = [];
    for (const proposal of proposals) {
      if (proposal.status === 'rejected') continue;
      for (const ambiguity of proposal.payload?.ambiguities ?? []) {
        if (ambiguity.clarification_question_draft) {
          questions.push({
            section: proposal.payload?.source?.section ?? '',
            document: proposal.payload?.source?.document ?? '',
            question: ambiguity.clarification_question_draft,
          });
        }
      }
    }
    questions.sort((a, b) =>
      `${a.document}${a.section}`.localeCompare(`${b.document}${b.section}`),
    );

    const lines: string[] = [
      `# Bieterfragen — ${meta?.title ?? project}`,
      '',
      `Ausschreibung: ${meta?.key ?? project}  `,
      `Stand: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '| Nr. | Dokument / Abschnitt | Frage |',
      '|---|---|---|',
      ...questions.map(
        (question, index) =>
          `| ${index + 1} | ${question.document} ${question.section} | ${question.question.replace(/\|/g, '\\|')} |`,
      ),
    ];
    const path = await this.renderDocx(
      project,
      lines.join('\n'),
      `exports/bieterfragen-${this.timestamp()}.docx`,
    );
    return { path, questions: questions.length };
  }
}
