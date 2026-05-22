import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PackageMaterializerService } from '../materializer/package-materializer.service';
import { PackageManifest } from '../dto/manifest.dto';
import { PackageLockfile } from '../dto/lockfile.dto';

export interface BuildResult {
  /** Suggested filename for Content-Disposition. */
  filename: string;
  /** Zip bytes ready to stream to the client. */
  buffer: Buffer;
  /** Warnings collected during materialization. */
  warnings: string[];
}

/**
 * Materializes a package into a tmp dir, writes manifest + lockfile JSON,
 * then zips the whole tree into a single buffer.
 *
 * Crucially: the builder never calls McpRegistryService.listServersResolved,
 * so unresolved placeholders in mcp server configs stay in the zip — no
 * secret leakage in distributed packages.
 */
@Injectable()
export class PackageBuilderService {
  private readonly logger = new Logger(PackageBuilderService.name);

  constructor(private readonly materializer: PackageMaterializerService) {}

  async build(manifest: PackageManifest, lockfile: PackageLockfile): Promise<BuildResult> {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-pkg-'));
    const stagingDir = path.join(tmpRoot, manifest.name);

    try {
      await fs.ensureDir(stagingDir);

      // Materialize the package into the staging dir. Intro videos copy from
      // frontend/public — disable for builds since the zip is meant to be
      // portable and shouldn't drag in 50MB of video assets.
      const result = await this.materializer.materialize(manifest, lockfile, stagingDir, {
        copyIntroVideos: false,
      });

      // Write manifest and lockfile at the staging root.
      await fs.writeJson(path.join(stagingDir, 'package.manifest.json'), manifest, { spaces: 2 });
      await fs.writeJson(path.join(stagingDir, 'package.lock.json'), lockfile, { spaces: 2 });

      // Zip the staging dir.
      const zip = new AdmZip();
      zip.addLocalFolder(stagingDir);
      const buffer = zip.toBuffer();

      const shortHash = lockfile.manifestHash.slice(0, 8);
      const filename = `${manifest.name}-${shortHash}.zip`;

      return { filename, buffer, warnings: result.warnings };
    } finally {
      try {
        await fs.remove(tmpRoot);
      } catch (err: any) {
        this.logger.warn(`Failed to clean up tmp dir ${tmpRoot}: ${err.message}`);
      }
    }
  }
}
