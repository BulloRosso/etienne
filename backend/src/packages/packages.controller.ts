import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PackagesService } from './packages.service';
import { PackageProfilesService } from './profiles/package-profiles.service';
import { PackageManifest } from './dto/manifest.dto';
import { DeployResult, ResolveResult, ValidateResult } from './dto/package-result.dto';
import { ValidationIssue } from './dto/lockfile.dto';
import { PackageProfile, PackageProfileSummary } from './dto/profile.dto';

@Controller('api/packages')
export class PackagesController {
  constructor(
    private readonly packages: PackagesService,
    private readonly profiles: PackageProfilesService,
  ) {}

  // ─── resolve / validate ───────────────────────────────────────────────

  @Post('resolve')
  async resolve(@Body() manifest: PackageManifest): Promise<ResolveResult> {
    return this.packages.resolve(manifest);
  }

  @Post('validate')
  async validate(@Body() manifest: PackageManifest): Promise<ValidateResult> {
    return this.packages.validate(manifest);
  }

  // ─── build / deploy ───────────────────────────────────────────────────

  @Post('build')
  async build(@Body() manifest: PackageManifest, @Res() res: Response): Promise<void> {
    try {
      const { filename, buffer, warnings } = await this.packages.build(manifest);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (warnings.length > 0) {
        res.setHeader('X-Package-Warnings', JSON.stringify(warnings));
      }
      res.send(buffer);
    } catch (err: any) {
      const conflicts = (err as { conflicts?: ValidationIssue[] }).conflicts;
      throw new HttpException(
        { message: err.message, conflicts },
        conflicts ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('deploy')
  async deploy(@Body() manifest: PackageManifest): Promise<DeployResult> {
    return this.packages.deploy(manifest);
  }

  /**
   * Derive a PackageManifest from an existing workspace project — used by
   * the "Promote to package" flow on the dashboard.
   *
   * Returns the manifest verbatim; the client loads it into the composer
   * draft store as a starting point.
   */
  @Get('from-project/:name')
  async fromProject(@Param('name') name: string): Promise<{ manifest: PackageManifest }> {
    try {
      const manifest = await this.packages.fromProject(name);
      return { manifest };
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Apply a previously-built package zip to a new project on this backend.
   *
   * Pass the package as multipart field `file`. Optional `?name=foo` query
   * overrides the project folder name (rewriting the embedded manifest to
   * match) — useful when the source zip's name clashes with an existing
   * project on the target machine.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Query('name') name?: string,
  ): Promise<DeployResult> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }
    return this.packages.import(file.buffer, name);
  }

  // ─── profiles ─────────────────────────────────────────────────────────

  @Get('profiles')
  async listProfiles(): Promise<{ profiles: PackageProfileSummary[] }> {
    return { profiles: await this.profiles.list() };
  }

  @Get('profiles/:id')
  async getProfile(@Param('id') id: string): Promise<PackageProfile> {
    const profile = await this.profiles.get(id);
    if (!profile) throw new NotFoundException(`Profile "${id}" not found`);
    return profile;
  }

  @Put('profiles/:id')
  async saveProfile(
    @Param('id') id: string,
    @Body() manifest: PackageManifest,
  ): Promise<PackageProfile> {
    try {
      return await this.profiles.save(id, manifest);
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete('profiles/:id')
  async deleteProfile(@Param('id') id: string): Promise<{ ok: boolean }> {
    const ok = await this.profiles.delete(id);
    if (!ok) throw new NotFoundException(`Profile "${id}" not found`);
    return { ok };
  }

  @Get('profiles/:id/thumbnail')
  async getThumbnail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const thumbPath = await this.profiles.getThumbnailPath(id);
    if (!thumbPath) throw new NotFoundException('Thumbnail not found');
    res.sendFile(thumbPath);
  }
}
