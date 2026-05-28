import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';

export type RfpKind = 'docx-bundle' | 'xlsx-questionnaire';
export type ExportTargetKind = 'docx-fillback' | 'xlsx-fill';

export interface RfpSource {
  path: string;
  role: 'primary' | 'supplementary';
}

export interface RfpExportTarget {
  kind: ExportTargetKind;
  templatePath?: string;
  answerColumnHeader?: string;
}

export interface Rfp {
  schema: 'rfp.v1';
  id: string;
  title: string;
  kind: RfpKind;
  sources: RfpSource[];
  coverageRef: string;
  sentinelRef: string;
  exportTarget: RfpExportTarget;
  dueDate?: string;
  synthesized?: boolean;
}

const LEGACY_COVERAGE_REL = 'out/coverage/current.coverage.json';
const LEGACY_SENTINEL_REL = 'out/compliance/current.compliance.json';
const RFPS_DIR_REL = 'out/rfps';

@Injectable()
export class RfpRegistryService {
  private readonly logger = new Logger(RfpRegistryService.name);
  private readonly config = new ClaudeConfig();

  async listRfps(projectName: string): Promise<Rfp[]> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const rfpsDir = join(root, RFPS_DIR_REL);

    const explicit: Rfp[] = [];
    try {
      const entries = await fs.readdir(rfpsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(join(rfpsDir, entry), 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed?.schema === 'rfp.v1' && typeof parsed.id === 'string') {
            explicit.push(parsed as Rfp);
          }
        } catch (err) {
          this.logger.warn(`Skipping malformed RFP file ${entry}: ${(err as Error).message}`);
        }
      }
    } catch {
      // No rfps/ directory — fall through to legacy synthesis below.
    }

    if (explicit.length > 0) {
      return explicit.sort((a, b) => a.id.localeCompare(b.id));
    }

    const legacy = await this.synthesizeLegacyRfp(projectName);
    return legacy ? [legacy] : [];
  }

  async getRfp(projectName: string, rfpId: string): Promise<Rfp> {
    const all = await this.listRfps(projectName);
    const found = all.find((r) => r.id === rfpId);
    if (!found) {
      throw new NotFoundException(
        `RFP "${rfpId}" not found in project "${projectName}". ` +
          `Known ids: ${all.map((r) => r.id).join(', ') || '(none)'}.`,
      );
    }
    return found;
  }

  async createRfp(projectName: string, rfp: Omit<Rfp, 'schema'>): Promise<Rfp> {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(rfp.id)) {
      throw new BadRequestException(
        `RFP id must be a slug ([a-zA-Z0-9-], leading alnum): got "${rfp.id}"`,
      );
    }
    const root = safeRoot(this.config.hostRoot, projectName);
    const rfpsDir = join(root, RFPS_DIR_REL);
    await fs.mkdir(rfpsDir, { recursive: true });
    const target = join(rfpsDir, `${rfp.id}.json`);
    try {
      await fs.access(target);
      throw new BadRequestException(`RFP "${rfp.id}" already exists at ${target}`);
    } catch (err: any) {
      if (err?.status === 400) throw err;
      // not exists — proceed
    }
    const full: Rfp = { schema: 'rfp.v1', ...rfp };
    await fs.writeFile(target, JSON.stringify(full, null, 2), 'utf-8');
    return full;
  }

  /**
   * Back-compat shim: when a project has no out/rfps/ entries but does have
   * the legacy out/coverage/current.coverage.json, synthesise a "main" RFP
   * so the cockpit keeps working without forcing a one-time migration.
   *
   * The synthesised entry is `synthesized: true` so callers can suppress
   * the RFP picker when it's the only RFP.
   */
  async synthesizeLegacyRfp(projectName: string): Promise<Rfp | null> {
    const root = safeRoot(this.config.hostRoot, projectName);
    try {
      await fs.access(join(root, LEGACY_COVERAGE_REL));
    } catch {
      return null;
    }
    return {
      schema: 'rfp.v1',
      id: 'main',
      title: 'Main RFP',
      kind: 'docx-bundle',
      sources: [],
      coverageRef: LEGACY_COVERAGE_REL,
      sentinelRef: LEGACY_SENTINEL_REL,
      exportTarget: { kind: 'docx-fillback' },
      synthesized: true,
    };
  }
}
