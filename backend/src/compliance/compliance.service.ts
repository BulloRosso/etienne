import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { GitTag } from '../checkpoints/checkpoint-provider.interface';

export interface ReleaseInfo {
  version: string;
  date: string;
  commitHash: string;
  reviewer: string;
  checkpointMessage: string;
}

export interface ReleasesManifest {
  releases: ReleaseInfo[];
}

export interface ReleaseComments {
  [filePath: string]: string;
}

export interface ComplianceStatus {
  hasReleaseNotes: boolean;
  hasChangelog: boolean;
  releases: ReleaseInfo[];
  currentVersion: string | null;
  isInitialRelease: boolean;
  claudeMdHasBaseline: boolean;
  projectFiles: string[];
  chatSessions: Array<{ sessionId: string; timestamp: string; summary?: string }>;
  releaseComments: ReleaseComments;
  gitTags: GitTag[];
}

export interface CreateReleaseDto {
  reviewerName: string;
  reviewerRole: string;
  summary: string;
  aiSystemUsed: string;
  reviewScope: string;
  reviewOutcome: 'APPROVED' | 'APPROVED WITH NOTES';
  knownLimitations: string;
  riskAssessment: string;
  notes: string;
  // Update release only
  compiledDocument?: string;
  changeEntries?: Array<{ type: 'Changed' | 'Added' | 'Fixed' | 'Removed'; description: string }>;
  fallbackPlan?: string;
  requirementsChanged?: boolean;
  requirementsChangeDescription?: string;
}

export interface ReleaseCommentDto {
  path: string;
  comment: string;
}

export interface DeleteReleaseCommentDto {
  path: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private readonly workspaceDir: string;
  private readonly guidelinePath: string;

  constructor(private readonly checkpointsService: CheckpointsService) {
    this.workspaceDir = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
    this.guidelinePath = path.join(__dirname, 'compliance-guideline.md');
  }

  // ── Path helpers ──

  private getProjectPath(project: string): string {
    return path.join(this.workspaceDir, project);
  }

  private getEtiennePath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne');
  }

  private getReleasesManifestPath(project: string): string {
    return path.join(this.getEtiennePath(project), 'releases.json');
  }

  private getReleaseCommentsPath(project: string): string {
    return path.join(this.getEtiennePath(project), 'release-comments.json');
  }

  private getSessionsPath(project: string): string {
    return path.join(this.getEtiennePath(project), 'chat.sessions.json');
  }

  // ── Manifest I/O ──

  private async readReleasesManifest(project: string): Promise<ReleasesManifest> {
    const manifestPath = this.getReleasesManifestPath(project);
    try {
      if (await fs.pathExists(manifestPath)) {
        const content = await fs.readFile(manifestPath, 'utf-8');
        const parsed = JSON.parse(content);
        return parsed.releases ? parsed : { releases: [] };
      }
    } catch (error) {
      this.logger.warn(`Failed to read releases manifest for ${project}`);
    }
    return { releases: [] };
  }

  private async writeReleasesManifest(project: string, manifest: ReleasesManifest): Promise<void> {
    const manifestPath = this.getReleasesManifestPath(project);
    await fs.ensureDir(path.dirname(manifestPath));
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  // ── Release Comments I/O ──

  async readReleaseComments(project: string): Promise<ReleaseComments> {
    const commentsPath = this.getReleaseCommentsPath(project);
    try {
      if (await fs.pathExists(commentsPath)) {
        const content = await fs.readFile(commentsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.warn(`Failed to read release comments for ${project}`);
    }
    return {};
  }

  private async writeReleaseComments(project: string, comments: ReleaseComments): Promise<void> {
    const commentsPath = this.getReleaseCommentsPath(project);
    await fs.ensureDir(path.dirname(commentsPath));
    await fs.writeFile(commentsPath, JSON.stringify(comments, null, 2), 'utf-8');
  }

  async saveReleaseComment(project: string, filePath: string, comment: string): Promise<void> {
    const comments = await this.readReleaseComments(project);
    comments[filePath] = comment;
    await this.writeReleaseComments(project, comments);
    this.logger.log(`Saved release comment for ${filePath} in ${project}`);
  }

  async deleteReleaseComment(project: string, filePath: string): Promise<void> {
    const comments = await this.readReleaseComments(project);
    delete comments[filePath];
    await this.writeReleaseComments(project, comments);
    this.logger.log(`Deleted release comment for ${filePath} in ${project}`);
  }

  // ── Chat Sessions ──

  private async readChatSessions(project: string): Promise<Array<{ sessionId: string; timestamp: string; summary?: string }>> {
    const sessionsPath = this.getSessionsPath(project);
    try {
      if (await fs.pathExists(sessionsPath)) {
        const content = await fs.readFile(sessionsPath, 'utf-8');
        const parsed = JSON.parse(content);
        return (parsed.sessions || []).map((s: any) => ({
          sessionId: s.sessionId,
          timestamp: s.timestamp,
          summary: s.summary,
        }));
      }
    } catch (error) {
      this.logger.warn(`Failed to read chat sessions for ${project}`);
    }
    return [];
  }

  // ── File listing ──

  private async listProjectFiles(project: string): Promise<string[]> {
    const projectPath = this.getProjectPath(project);
    const files: string[] = [];

    const walk = async (dir: string, prefix: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip system directories
        if (entry.name === '.etienne' || entry.name === '.claude' || entry.name === '.git' || entry.name === 'node_modules') continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), relative);
        } else {
          files.push(relative);
        }
      }
    };

    try {
      await walk(projectPath, '');
    } catch (error) {
      this.logger.warn(`Failed to list files for ${project}`);
    }
    return files;
  }

  // ── Guideline ──

  async getGuideline(): Promise<string> {
    try {
      return await fs.readFile(this.guidelinePath, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to read compliance guideline');
      throw new Error('Compliance guideline not found');
    }
  }

  // ── Status ──

  async getStatus(project: string): Promise<ComplianceStatus> {
    const projectPath = this.getProjectPath(project);

    const [
      releaseNotesExists,
      changelogExists,
      manifest,
      claudeMdContent,
      projectFiles,
      chatSessions,
      releaseComments,
      gitTags,
    ] = await Promise.all([
      fs.pathExists(path.join(projectPath, 'RELEASE_NOTES.md')),
      fs.pathExists(path.join(projectPath, 'CHANGELOG.md')),
      this.readReleasesManifest(project),
      fs.readFile(path.join(projectPath, 'CLAUDE.md'), 'utf-8').catch(() => ''),
      this.listProjectFiles(project),
      this.readChatSessions(project),
      this.readReleaseComments(project),
      this.checkpointsService.listTags(project).catch(() => [] as GitTag[]),
    ]);

    const currentVersion = manifest.releases.length > 0
      ? manifest.releases[0].version
      : null;

    return {
      hasReleaseNotes: releaseNotesExists,
      hasChangelog: changelogExists,
      releases: manifest.releases,
      currentVersion,
      isInitialRelease: manifest.releases.length === 0,
      claudeMdHasBaseline: claudeMdContent.includes('Requirements Baseline'),
      projectFiles,
      chatSessions,
      releaseComments,
      gitTags,
    };
  }

  // ── Create Release ──

  async createRelease(project: string, dto: CreateReleaseDto): Promise<ReleaseInfo> {
    const projectPath = this.getProjectPath(project);
    const manifest = await this.readReleasesManifest(project);
    const chatSessions = await this.readChatSessions(project);

    // Determine version
    let version: string;
    if (manifest.releases.length === 0) {
      version = 'v1.0';
    } else {
      const lastVersion = manifest.releases[0].version;
      const match = lastVersion.match(/v(\d+)\.(\d+)/);
      if (match) {
        version = `v${match[1]}.${parseInt(match[2]) + 1}`;
      } else {
        version = `v1.${manifest.releases.length}`;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const isInitial = manifest.releases.length === 0;

    // Session info for artifacts
    const sessionCount = chatSessions.length;
    const sessionDateRange = chatSessions.length > 0
      ? `${chatSessions[chatSessions.length - 1].timestamp.split('T')[0]} – ${chatSessions[0].timestamp.split('T')[0]}`
      : 'N/A';

    if (isInitial) {
      // ── v1.0: Initial Release ──

      // 1. Add baseline header to CLAUDE.md
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      let claudeMd = '';
      try {
        claudeMd = await fs.readFile(claudeMdPath, 'utf-8');
      } catch {
        claudeMd = '';
      }
      if (!claudeMd.includes('Requirements Baseline')) {
        const baselineHeader = `\n\n## Requirements Baseline — ${version}\nDate: ${today}\n`;
        claudeMd += baselineHeader;
        await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
      }

      // 2. Generate RELEASE_NOTES.md
      const releaseNotes = `# Release Notes — ${version}

## Date
${today}

## Reviewer
${dto.reviewerName}

## Role
${dto.reviewerRole}

## Summary
${dto.summary}

## AI System Used
- Model: ${dto.aiSystemUsed}
- Chat sessions: ${sessionCount} (${sessionDateRange})

## Requirements Reference
CLAUDE.md (baseline ${version})

## Review Scope
${dto.reviewScope}

## Review Outcome
${dto.reviewOutcome}

## Known Limitations
${dto.knownLimitations}

## Risk Assessment
${dto.riskAssessment}

## Notes
${dto.notes}
`;
      await fs.writeFile(path.join(projectPath, 'RELEASE_NOTES.md'), releaseNotes, 'utf-8');

    } else {
      // ── v1.x+: Update Release ──

      // 1. Update CLAUDE.md if requirements changed
      if (dto.requirementsChanged && dto.requirementsChangeDescription) {
        const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
        let claudeMd = '';
        try {
          claudeMd = await fs.readFile(claudeMdPath, 'utf-8');
        } catch {
          claudeMd = '';
        }
        const updateHeader = `\n\n## Requirements Update — ${version}\nDate: ${today}\nChanges: ${dto.requirementsChangeDescription}\n`;
        claudeMd += updateHeader;
        await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
      }

      // 2. Write DIFF_PROTOCOL
      if (dto.compiledDocument) {
        const diffProtocolPath = path.join(projectPath, `DIFF_PROTOCOL_${version}.md`);
        await fs.writeFile(diffProtocolPath, dto.compiledDocument, 'utf-8');
      }

      // 3. Update/create CHANGELOG.md
      const changelogPath = path.join(projectPath, 'CHANGELOG.md');
      let existingChangelog = '';
      try {
        existingChangelog = await fs.readFile(changelogPath, 'utf-8');
      } catch {
        // doesn't exist yet
      }

      const changeEntries = dto.changeEntries || [];
      const grouped: Record<string, string[]> = {};
      for (const entry of changeEntries) {
        if (!grouped[entry.type]) grouped[entry.type] = [];
        grouped[entry.type].push(entry.description);
      }

      let changelogEntry = `## [${version}] — ${today}\n\n`;
      for (const type of ['Added', 'Changed', 'Fixed', 'Removed']) {
        if (grouped[type] && grouped[type].length > 0) {
          changelogEntry += `### ${type}\n`;
          for (const desc of grouped[type]) {
            changelogEntry += `- ${desc}\n`;
          }
          changelogEntry += '\n';
        }
      }
      changelogEntry += `### Reviewer\n${dto.reviewerName}\n\n`;
      changelogEntry += `### AI Interaction\n- Chat sessions: ${sessionCount} (${sessionDateRange})\n- Model used: ${dto.aiSystemUsed}\n`;

      if (existingChangelog) {
        // Insert new entry after the header
        const headerEnd = existingChangelog.indexOf('\n## [');
        if (headerEnd !== -1) {
          const header = existingChangelog.substring(0, headerEnd);
          const rest = existingChangelog.substring(headerEnd);
          existingChangelog = `${header}\n\n${changelogEntry}\n---\n${rest}`;
        } else {
          existingChangelog += `\n\n${changelogEntry}`;
        }
        await fs.writeFile(changelogPath, existingChangelog, 'utf-8');
      } else {
        const newChangelog = `# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

${changelogEntry}
---

## [v1.0] — ${manifest.releases.length > 0 ? manifest.releases[manifest.releases.length - 1].date : today}
Initial release. See RELEASE_NOTES.md.
`;
        await fs.writeFile(changelogPath, newChangelog, 'utf-8');
      }
    }

    // Create checkpoint
    const checkpointMessage = `Release ${version} — ${dto.summary}`;
    const commitHash = await this.checkpointsService.createCheckpoint(project, checkpointMessage);

    // Create git tag for the release
    try {
      await this.checkpointsService.createTag(project, version, checkpointMessage);
    } catch (tagError: any) {
      this.logger.warn(`Failed to create git tag ${version}: ${tagError.message}`);
    }

    // Store release metadata
    const releaseInfo: ReleaseInfo = {
      version,
      date: today,
      commitHash,
      reviewer: dto.reviewerName,
      checkpointMessage,
    };
    manifest.releases.unshift(releaseInfo);
    await this.writeReleasesManifest(project, manifest);

    // Clear release comments
    await this.writeReleaseComments(project, {});

    this.logger.log(`Created release ${version} for project ${project}`);
    return releaseInfo;
  }
}
