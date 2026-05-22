import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PackageManifest } from '../dto/manifest.dto';
import { PackageProfile, PackageProfileSummary } from '../dto/profile.dto';

/**
 * Filesystem-backed CRUD for saved package profiles.
 *
 * Each profile is stored as <PACKAGE_PROFILE_REPOSITORY>/<id>/manifest.json,
 * mirroring the existing repo-as-env-var pattern used by skills, subagents,
 * application types, and project templates.
 *
 * Writes are atomic: tmp file + rename, so a crashed write can't leave a
 * profile in a half-saved state.
 */
@Injectable()
export class PackageProfilesService {
  private readonly logger = new Logger(PackageProfilesService.name);

  private getRepositoryPath(): string {
    return (
      process.env.PACKAGE_PROFILE_REPOSITORY ||
      path.resolve(process.cwd(), '..', 'package-profile-repository')
    );
  }

  private getProfileDir(id: string): string {
    return path.join(this.getRepositoryPath(), id);
  }

  async list(): Promise<PackageProfileSummary[]> {
    const repoPath = this.getRepositoryPath();
    if (!(await fs.pathExists(repoPath))) return [];

    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const out: PackageProfileSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifestPath = path.join(repoPath, entry.name, 'manifest.json');
        if (!(await fs.pathExists(manifestPath))) continue;
        const manifest = (await fs.readJson(manifestPath)) as PackageManifest;
        const stat = await fs.stat(manifestPath);
        const thumbPath = path.join(repoPath, entry.name, 'thumbnail.png');
        out.push({
          id: entry.name,
          label: manifest.agentName || manifest.name || entry.name,
          hasThumbnail: await fs.pathExists(thumbPath),
          updatedAt: stat.mtime.toISOString(),
        });
      } catch (err: any) {
        this.logger.warn(`Failed to read profile "${entry.name}": ${err.message}`);
      }
    }

    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  async get(id: string): Promise<PackageProfile | null> {
    const manifestPath = path.join(this.getProfileDir(id), 'manifest.json');
    if (!(await fs.pathExists(manifestPath))) return null;
    const manifest = (await fs.readJson(manifestPath)) as PackageManifest;
    const stat = await fs.stat(manifestPath);
    return { id, manifest, updatedAt: stat.mtime.toISOString() };
  }

  async save(id: string, manifest: PackageManifest): Promise<PackageProfile> {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      throw new Error(`Invalid profile id "${id}". Use kebab-case alphanumerics.`);
    }
    const dir = this.getProfileDir(id);
    await fs.ensureDir(dir);
    const manifestPath = path.join(dir, 'manifest.json');
    const tmpPath = manifestPath + '.tmp';
    await fs.writeJson(tmpPath, manifest, { spaces: 2 });
    await fs.move(tmpPath, manifestPath, { overwrite: true });
    const stat = await fs.stat(manifestPath);
    return { id, manifest, updatedAt: stat.mtime.toISOString() };
  }

  async delete(id: string): Promise<boolean> {
    const dir = this.getProfileDir(id);
    if (!(await fs.pathExists(dir))) return false;
    await fs.remove(dir);
    return true;
  }

  async getThumbnailPath(id: string): Promise<string | null> {
    const p = path.join(this.getProfileDir(id), 'thumbnail.png');
    return (await fs.pathExists(p)) ? p : null;
  }
}
