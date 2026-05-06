import { Injectable, NotFoundException, BadRequestException, Optional, Inject, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, extname, dirname, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';
import { FileWatcherService } from '../event-handling/core/file-watcher.service';

const execAsync = promisify(exec);

@Injectable()
export class ContentManagementService {
  private readonly logger = new Logger(ContentManagementService.name);
  private readonly config = new ClaudeConfig();

  constructor(
    @Optional() @Inject(FileWatcherService) private readonly fileWatcher?: FileWatcherService,
  ) {}

  /**
   * Get MIME type based on file extension
   */
  getMimeType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Read file content from workspace
   */
  async getFileContent(projectName: string, filepath: string): Promise<{ content: Buffer; mimeType: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Read file content as buffer to support both text and binary files
      const content = await fs.readFile(fullPath);
      const mimeType = this.getMimeType(filepath);

      return { content, mimeType };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${filepath}`);
      }
      throw error;
    }
  }

  /**
   * Convert a DOCX/DOC file to PDF via LibreOffice for preview.
   * Returns the PDF buffer and MIME type.
   */
  async convertDocxToPdf(projectName: string, filepath: string): Promise<{ content: Buffer; mimeType: string }> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const fullPath = join(root, filepath);

    // Verify source exists
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException(`File not found: ${filepath}`);
    }

    const tempId = randomUUID();
    const tempDir = join(tmpdir(), 'etienne-docx-preview');
    await fs.mkdir(tempDir, { recursive: true });

    const ext = extname(filepath).toLowerCase();
    const tempSourcePath = join(tempDir, `${tempId}${ext}`);

    try {
      // Copy the source file to temp directory
      await fs.copyFile(fullPath, tempSourcePath);

      // Convert to PDF via LibreOffice
      const cmd = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${tempSourcePath}"`;
      await execAsync(cmd, { timeout: 60_000 });

      const tempPdfPath = join(tempDir, `${tempId}.pdf`);

      // Verify PDF was created
      try {
        await fs.access(tempPdfPath);
      } catch {
        throw new BadRequestException(
          'LibreOffice conversion produced no output. Is LibreOffice (soffice) installed?',
        );
      }

      const content = await fs.readFile(tempPdfPath);
      this.logger.log(`DOCX preview: converted ${filepath} to PDF (${content.length} bytes)`);

      return { content, mimeType: 'application/pdf' };
    } finally {
      // Clean up temp files
      try { await fs.unlink(tempSourcePath); } catch { /* ignore */ }
      try { await fs.unlink(join(tempDir, `${tempId}.pdf`)); } catch { /* ignore */ }
    }
  }

  /**
   * Delete a file or folder
   */
  async deleteFileOrFolder(projectName: string, filepath: string): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Check if the path exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new NotFoundException(`Path not found: ${filepath}`);
      }

      // Check if it's a file or directory
      const stats = await fs.stat(fullPath);

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        if (stats.isDirectory()) {
          // Remove directory and all its contents
          await fs.rm(fullPath, { recursive: true, force: true });
        } else {
          // Remove file
          await fs.unlink(fullPath);
        }
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      return {
        success: true,
        message: stats.isDirectory() ? `Directory deleted: ${filepath}` : `File deleted: ${filepath}`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete: ${error.message}`);
    }
  }

  /**
   * Move a file or folder to a new location
   */
  async moveFileOrFolder(
    projectName: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const sourceFullPath = join(root, sourcePath);
      const destFullPath = join(root, destinationPath);

      // Check if source exists
      try {
        await fs.access(sourceFullPath);
      } catch {
        throw new NotFoundException(`Source path not found: ${sourcePath}`);
      }

      // Ensure destination directory exists
      const destDir = dirname(destFullPath);
      await fs.mkdir(destDir, { recursive: true });

      // Check if destination already exists
      try {
        await fs.access(destFullPath);
        throw new BadRequestException(`Destination already exists: ${destinationPath}`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Destination doesn't exist, which is what we want
      }

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        await fs.rename(sourceFullPath, destFullPath);
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      return {
        success: true,
        message: `Moved from ${sourcePath} to ${destinationPath}`
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to move: ${error.message}`);
    }
  }

  /**
   * Rename a file or folder
   */
  async renameFileOrFolder(
    projectName: string,
    filepath: string,
    newName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Check if source exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new NotFoundException(`Path not found: ${filepath}`);
      }

      // Calculate new path (same directory, new name)
      const dir = dirname(fullPath);
      const newFullPath = join(dir, newName);

      // Check if destination already exists
      try {
        await fs.access(newFullPath);
        throw new BadRequestException(`A file or folder with name "${newName}" already exists`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Destination doesn't exist, which is what we want
      }

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        await fs.rename(fullPath, newFullPath);
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      const newRelativePath = join(dirname(filepath), newName);
      return {
        success: true,
        message: `Renamed to ${newName}`,
        newPath: newRelativePath
      } as any;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to rename: ${error.message}`);
    }
  }

  /**
   * Save text content to a file
   */
  async saveFileContent(
    projectName: string,
    filepath: string,
    content: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Ensure directory exists
      const dir = dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write text content
      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        message: `File saved: ${filepath}`,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to save file: ${error.message}`);
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(
    projectName: string,
    filepath: string,
    content: Buffer
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Ensure directory exists
      const dir = dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content);

      return {
        success: true,
        message: `File uploaded: ${filepath}`
      };
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Convert Markdown content to a styled HTML document string.
   * Shared helper used by DOCX/PDF export pipelines.
   */
  private async markdownToHtml(markdownContent: string): Promise<string> {
    const { marked } = await (new Function('return import("marked")'))();
    const htmlBody = marked.parse(markdownContent, { breaks: true, gfm: true });
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin: 2cm; }
  h1 { font-size: 18pt; margin-top: 24pt; }
  h2 { font-size: 16pt; margin-top: 18pt; }
  h3 { font-size: 14pt; margin-top: 14pt; }
  h4 { font-size: 12pt; margin-top: 12pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; border: 1px solid #ccc; }
  th, td { padding: 4pt 8pt; text-align: left; word-wrap: break-word; overflow-wrap: break-word; border-bottom: 1px solid #ccc; }
  th { background: #f0f0f0; font-weight: bold; }
  code { font-family: Consolas, monospace; font-size: 10pt; background: #f5f5f5; padding: 1pt 3pt; }
  pre { background: #f5f5f5; padding: 8pt; overflow-x: auto; }
</style>
</head><body>${htmlBody}</body></html>`;
  }

  /**
   * Convert Markdown content to DOCX and return the buffer (no filesystem write).
   * Uses @turbodocx/html-to-docx for proper table width handling.
   */
  async exportMarkdownToDocxBuffer(markdownContent: string): Promise<Buffer> {
    const html = await this.markdownToHtml(markdownContent);
    const HTMLtoDOCX = require('@turbodocx/html-to-docx');
    return await HTMLtoDOCX(html, null, {
      table: {
        row: { cantSplit: true },
      },
    });
  }

  /**
   * Convert Markdown content to PDF and return the buffer (no filesystem write).
   */
  async exportMarkdownToPdfBuffer(markdownContent: string): Promise<Buffer> {
    const html = await this.markdownToHtml(markdownContent);

    const tempId = randomUUID();
    const tempDir = join(tmpdir(), 'etienne-pdf-export');
    await fs.mkdir(tempDir, { recursive: true });
    const tempHtmlPath = join(tempDir, `${tempId}.html`);

    try {
      await fs.writeFile(tempHtmlPath, html, 'utf-8');

      const cmd = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${tempHtmlPath}"`;
      await execAsync(cmd, { timeout: 60_000 });

      const tempPdfPath = join(tempDir, `${tempId}.pdf`);
      try {
        await fs.access(tempPdfPath);
      } catch {
        throw new BadRequestException('LibreOffice conversion produced no output. Is LibreOffice (soffice) installed?');
      }

      return await fs.readFile(tempPdfPath);
    } finally {
      try { await fs.unlink(tempHtmlPath); } catch { /* ignore */ }
      try { await fs.unlink(join(tempDir, `${tempId}.pdf`)); } catch { /* ignore */ }
    }
  }

  /**
   * Convert Markdown content to DOCX via LibreOffice and save to target path.
   * Pipeline: Markdown → HTML (via marked) → temp .html file → soffice --convert-to docx → target path
   */
  async exportMarkdownToDocx(
    projectName: string,
    filepath: string,
    markdownContent: string,
  ): Promise<{ success: boolean; message: string }> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const fullPath = join(root, filepath);

    // Ensure target directory exists
    const dir = dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    const docxBuffer = await this.exportMarkdownToDocxBuffer(markdownContent);
    await fs.writeFile(fullPath, docxBuffer);

    this.logger.log(`Exported DOCX: ${filepath} (${docxBuffer.length} bytes)`);

    return {
      success: true,
      message: `Exported to ${filepath}`,
    };
  }

  /**
   * Export Markdown to DOCX using an existing DOCX as a template.
   * Selectively replaces only the specified sections while preserving everything else.
   *
   * Pipeline:
   *   1. Open template DOCX with adm-zip
   *   2. Discover heading styles from word/styles.xml
   *   3. Split document.xml body into sections by Heading 1
   *   4. Replace selected sections with generated Markdown (converted to OOXML)
   *   5. Reassemble and write output
   */
  async exportMarkdownToDocxWithTemplate(
    projectName: string,
    outputPath: string,
    markdownContent: string,
    templateDocPath: string,
    selectedSections: { number: string; title: string }[],
  ): Promise<{ success: boolean; message: string }> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const fullOutputPath = join(root, outputPath);
    const fullTemplatePath = join(root, templateDocPath);

    // Ensure output directory exists
    await fs.mkdir(dirname(fullOutputPath), { recursive: true });

    // Verify template exists
    try {
      await fs.access(fullTemplatePath);
    } catch {
      throw new BadRequestException(`Template document not found: ${templateDocPath}`);
    }

    const templateBuffer = await fs.readFile(fullTemplatePath);
    const zip = new AdmZip(templateBuffer);

    // --- Discover heading styles ---
    const stylesEntry = zip.getEntry('word/styles.xml');
    const headingStyleIds = new Map<number, string>();
    let listParagraphStyleId = 'ListParagraph';

    if (stylesEntry) {
      const stylesXml = stylesEntry.getData().toString('utf-8');
      // Find heading styles: <w:style w:type="paragraph" w:styleId="XXX">...<w:name w:val="heading N"/>
      const stylePattern = /<w:style\b[^>]*w:type="paragraph"[^>]*w:styleId="([^"]*)"[^>]*>([\s\S]*?)<\/w:style>/gi;
      let styleMatch: RegExpExecArray | null;
      while ((styleMatch = stylePattern.exec(stylesXml)) !== null) {
        const styleId = styleMatch[1];
        const inner = styleMatch[2];
        const nameMatch = inner.match(/<w:name\s+w:val="([^"]*)"/i);
        if (nameMatch) {
          const nameVal = nameMatch[1].toLowerCase();
          const headingMatch = nameVal.match(/^heading\s+(\d+)$/);
          if (headingMatch) {
            headingStyleIds.set(parseInt(headingMatch[1], 10), styleId);
          }
          if (nameVal === 'list paragraph') {
            listParagraphStyleId = styleId;
          }
        }
      }
    }

    // Fallback heading styles if none found
    if (headingStyleIds.size === 0) {
      for (let i = 1; i <= 6; i++) headingStyleIds.set(i, `Heading${i}`);
    }

    const heading1StyleId = headingStyleIds.get(1) ?? 'Heading1';

    // --- Parse document.xml ---
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      throw new BadRequestException('Template DOCX has no word/document.xml');
    }
    const docXml = docEntry.getData().toString('utf-8');

    // Extract <w:body> content
    const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
    if (!bodyMatch) {
      throw new BadRequestException('Cannot parse <w:body> in template');
    }
    const bodyContent = bodyMatch[1];

    // Extract <w:sectPr> (last one, defines page layout) — must be preserved
    const sectPrMatch = bodyContent.match(/(<w:sectPr[\s\S]*<\/w:sectPr>)\s*$/);
    const sectPr = sectPrMatch ? sectPrMatch[1] : '';
    const bodyWithoutSectPr = sectPr ? bodyContent.slice(0, bodyContent.lastIndexOf(sectPr)) : bodyContent;

    // --- Split body into sections by Heading 1 paragraphs ---
    // A "section" = one Heading 1 paragraph + all content until the next Heading 1 (or end)
    const sections = splitBodyBySections(bodyWithoutSectPr, heading1StyleId);

    // --- Split generated Markdown by top-level headings ---
    // The generated Markdown has ## headings for each section (depth+1 from assembleMarkdown)
    const mdSections = splitMarkdownBySections(markdownContent);

    // --- Replace selected sections ---
    const replacedBody: string[] = [];

    // Always preserve preamble (title page, TOC, content before first heading)
    if (sections.length > 0 && sections[0].preambleXml) {
      replacedBody.push(sections[0].preambleXml);
    }

    for (const section of sections) {
      const matched = matchSectionToSelected(section.headingText, selectedSections);
      if (matched) {
        // Keep the original heading paragraph from the template
        replacedBody.push(section.headingXml);
        // Find generated content for this section
        const mdContent = findMarkdownForSection(matched, mdSections);
        if (mdContent) {
          replacedBody.push(markdownBodyToOoxml(mdContent, headingStyleIds, listParagraphStyleId));
        }
      } else {
        // Keep entire section as-is (heading + content)
        replacedBody.push(section.headingXml);
        replacedBody.push(section.contentXml);
      }
    }

    // Reassemble document.xml
    const newBody = `<w:body>${replacedBody.join('')}${sectPr}</w:body>`;
    const newDocXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, newBody);

    zip.updateFile('word/document.xml', Buffer.from(newDocXml, 'utf-8'));

    // Force TOC and other fields to refresh when the document is opened
    const settingsEntry = zip.getEntry('word/settings.xml');
    if (settingsEntry) {
      let settingsXml = settingsEntry.getData().toString('utf-8');
      if (!settingsXml.includes('<w:updateFields')) {
        settingsXml = settingsXml.replace(
          /(<w:settings[^>]*>)/,
          '$1<w:updateFields w:val="true"/>',
        );
        zip.updateFile('word/settings.xml', Buffer.from(settingsXml, 'utf-8'));
      }
    }

    const outputBuffer = zip.toBuffer();
    await fs.writeFile(fullOutputPath, outputBuffer);

    this.logger.log(`Exported DOCX with template: ${outputPath} (${outputBuffer.length} bytes)`);
    return { success: true, message: `Exported to ${outputPath}` };
  }

  /**
   * Create a new folder
   */
  async createFolder(
    projectName: string,
    folderPath: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, folderPath);

      // Check if folder already exists
      try {
        await fs.access(fullPath);
        throw new BadRequestException(`Folder already exists: ${folderPath}`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Folder doesn't exist, which is what we want
      }

      // Create folder
      await fs.mkdir(fullPath, { recursive: true });

      return {
        success: true,
        message: `Folder created: ${folderPath}`
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Get user interface configuration
   */
  async getUserInterfaceConfig(projectName: string): Promise<any> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configPath = join(root, '.etienne', 'user-interface.json');

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist, return null
        }
        throw error;
      }
    } catch (error) {
      // Return null for any file not found errors
      if (error.code === 'ENOENT') {
        return null;
      }
      // For path traversal or other security errors, rethrow
      if (error.message === 'Path traversal') {
        throw error;
      }
      // For other errors, return null (file system issues, permission problems, etc.)
      console.warn(`Could not read UI config for project ${projectName}:`, error.message);
      return null;
    }
  }

  /**
   * Save user interface configuration
   */
  async saveUserInterfaceConfig(
    projectName: string,
    config: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configDir = join(root, '.etienne');
      const configPath = join(configDir, 'user-interface.json');

      // Ensure .etienne directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      return {
        success: true,
        message: 'UI configuration saved successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to save UI configuration: ${error.message}`);
    }
  }

  /**
   * List all projects that have a user-interface.json file
   */
  async listProjectsWithUIConfig(): Promise<string[]> {
    try {
      const workspaceRoot = this.config.hostRoot;
      const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });

      const projectsWithUI: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const configPath = join(workspaceRoot, entry.name, '.etienne', 'user-interface.json');
          try {
            await fs.access(configPath);
            projectsWithUI.push(entry.name);
          } catch {
            // File doesn't exist, skip this project
          }
        }
      }

      return projectsWithUI;
    } catch (error) {
      throw new BadRequestException(`Failed to list projects with UI config: ${error.message}`);
    }
  }

  /**
   * Get project history from root CLAUDE.md file
   */
  async getProjectHistory(projectName: string): Promise<string> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const historyPath = join(root, 'CLAUDE.md');

      try {
        const content = await fs.readFile(historyPath, 'utf-8');
        return content;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return ''; // File doesn't exist, return empty string
        }
        throw error;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return '';
      }
      if (error.message === 'Path traversal') {
        throw error;
      }
      console.warn(`Could not read project history for project ${projectName}:`, error.message);
      return '';
    }
  }

  /**
   * Append to project history in root CLAUDE.md file
   */
  async appendProjectHistory(
    projectName: string,
    content: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const historyPath = join(root, 'CLAUDE.md');

      // Read existing content if file exists
      let existingContent = '';
      try {
        existingContent = await fs.readFile(historyPath, 'utf-8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, start with empty content
      }

      // Append new content with proper spacing
      const newContent = existingContent
        ? `${existingContent}\n\n${content}`
        : content;

      // Write the updated content
      await fs.writeFile(historyPath, newContent, 'utf-8');

      return {
        success: true,
        message: 'Project history updated successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to append project history: ${error.message}`);
    }
  }

  /**
   * Search for files recursively matching a query string
   * Excludes system directories like .claude and .etienne
   */
  async searchFiles(
    projectName: string,
    query: string
  ): Promise<Array<{ name: string; path: string }>> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const results: Array<{ name: string; path: string }> = [];
      const lowerQuery = query.toLowerCase();

      // Recursively search through directories
      const searchDirectory = async (dirPath: string, relativePath: string = '') => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const entryFullPath = join(dirPath, entry.name);

            // Skip system directories
            if (entry.name === '.claude' || entry.name === '.etienne' || entry.name === 'data') {
              continue;
            }

            if (entry.isDirectory()) {
              // Recursively search subdirectories
              await searchDirectory(entryFullPath, entryRelativePath);
            } else if (entry.isFile()) {
              // Check if filename starts with query (prefix match)
              if (entry.name.toLowerCase().startsWith(lowerQuery)) {
                results.push({
                  name: entry.name,
                  path: entryRelativePath
                });
              }
            }
          }
        } catch (error) {
          // Skip directories we can't read
          console.warn(`Could not read directory ${dirPath}:`, error.message);
        }
      };

      await searchDirectory(root);

      // Sort results by filename
      results.sort((a, b) => a.name.localeCompare(b.name));

      return results;
    } catch (error) {
      throw new BadRequestException(`Failed to search files: ${error.message}`);
    }
  }

  /**
   * List image files in an images/ subdirectory relative to a given directory path.
   * Returns existence flag and sorted image metadata.
   */
  async listImages(
    projectName: string,
    directoryPath: string
  ): Promise<{ exists: boolean; images: Array<{ name: string; path: string; createdAt: string }> }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const imagesDir = directoryPath
        ? join(root, directoryPath, 'images')
        : join(root, 'images');

      try {
        await fs.access(imagesDir);
      } catch {
        return { exists: false, images: [] };
      }

      const entries = await fs.readdir(imagesDir, { withFileTypes: true });
      const imageExtensions = new Set(['.png', '.jpg', '.jpeg']);
      const images: Array<{ name: string; path: string; createdAt: string }> = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (!imageExtensions.has(ext)) continue;

        const fullPath = join(imagesDir, entry.name);
        const stat = await fs.stat(fullPath);
        const relativePath = directoryPath
          ? `${directoryPath}/images/${entry.name}`
          : `images/${entry.name}`;

        images.push({
          name: entry.name,
          path: relativePath,
          createdAt: stat.birthtime.toISOString(),
        });
      }

      // Sort by creation date descending (newest first), cap at 50
      images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { exists: true, images: images.slice(0, 50) };
    } catch (error) {
      if (error.message === 'Path traversal') {
        throw error;
      }
      throw new BadRequestException(`Failed to list images: ${error.message}`);
    }
  }

  /**
   * Get workbench configuration
   */
  async getWorkbenchConfig(projectName: string): Promise<any> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configPath = join(root, '.etienne', 'workbench.json');

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist, return null
        }
        throw error;
      }
    } catch (error) {
      // Return null for any file not found errors
      if (error.code === 'ENOENT') {
        return null;
      }
      // For path traversal or other security errors, rethrow
      if (error.message === 'Path traversal') {
        throw error;
      }
      // For other errors, return null (file system issues, permission problems, etc.)
      console.warn(`Could not read workbench config for project ${projectName}:`, error.message);
      return null;
    }
  }

  /**
   * Save workbench configuration
   */
  async saveWorkbenchConfig(
    projectName: string,
    config: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configDir = join(root, '.etienne');
      const configPath = join(configDir, 'workbench.json');

      // Ensure .etienne directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Workbench configuration saved successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to save workbench configuration: ${error.message}`);
    }
  }

  /**
   * Copy files and folders from one project to another.
   * Overwrites existing files in the destination project.
   */
  async copyBetweenProjects(
    sourceProject: string,
    paths: string[],
    destinationProject: string,
  ): Promise<{ success: boolean; message: string; copiedCount: number }> {
    if (sourceProject === destinationProject) {
      throw new BadRequestException('Source and destination projects must be different');
    }
    if (!paths || paths.length === 0) {
      throw new BadRequestException('No paths specified for copying');
    }

    const sourceRoot = safeRoot(this.config.hostRoot, sourceProject);
    const destRoot = safeRoot(this.config.hostRoot, destinationProject);

    // Verify destination project directory exists
    try {
      await fs.access(destRoot);
    } catch {
      throw new NotFoundException(`Destination project not found: ${destinationProject}`);
    }

    if (this.fileWatcher) {
      await this.fileWatcher.suspend();
    }

    let copiedCount = 0;
    try {
      for (const filePath of paths) {
        const sourceFullPath = join(sourceRoot, filePath);
        const destFullPath = join(destRoot, filePath);

        // Verify source exists
        try {
          await fs.access(sourceFullPath);
        } catch {
          this.logger.warn(`Skipping non-existent source path: ${filePath}`);
          continue;
        }

        // Ensure destination parent directory exists
        await fs.mkdir(dirname(destFullPath), { recursive: true });

        const stats = await fs.stat(sourceFullPath);
        if (stats.isDirectory()) {
          await fs.cp(sourceFullPath, destFullPath, { recursive: true, force: true });
        } else {
          await fs.copyFile(sourceFullPath, destFullPath);
        }
        copiedCount++;
      }
    } finally {
      if (this.fileWatcher) {
        await this.fileWatcher.resume();
      }
    }

    return {
      success: true,
      message: `Copied ${copiedCount} item(s) to project ${destinationProject}`,
      copiedCount,
    };
  }
}

// ---------------------------------------------------------------------------
// DOCX template helpers (used by exportMarkdownToDocxWithTemplate)
// ---------------------------------------------------------------------------

interface DocSection {
  /** XML before the first Heading 1 (only present on section index 0) */
  preambleXml: string;
  /** The Heading 1 paragraph XML */
  headingXml: string;
  /** Extracted plain text of the heading */
  headingText: string;
  /** All content XML between this heading and the next Heading 1 */
  contentXml: string;
}

/**
 * Split the body XML (without sectPr) into sections delimited by Heading 1 paragraphs.
 * Uses positional string slicing to preserve ALL XML content (including <w:sdt> TOC
 * wrappers, bookmarks, custom XML, etc.) rather than extracting individual elements.
 */
function splitBodyBySections(bodyXml: string, heading1StyleId: string): DocSection[] {
  const sections: DocSection[] = [];

  // Find all Heading 1 paragraph positions by scanning <w:p> elements.
  // <w:p> elements do not nest in OOXML, so the lazy quantifier is safe.
  const pPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
  const h1Positions: { start: number; end: number; text: string }[] = [];
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pPattern.exec(bodyXml)) !== null) {
    const xml = pMatch[0];
    const styleMatch = xml.match(/<w:pStyle\s+w:val="([^"]*)"/);
    if (styleMatch && styleMatch[1] === heading1StyleId) {
      // Extract heading text
      const textParts: string[] = [];
      const tPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tPattern.exec(xml)) !== null) {
        textParts.push(tMatch[1]);
      }
      h1Positions.push({
        start: pMatch.index,
        end: pMatch.index + xml.length,
        text: textParts.join(''),
      });
    }
  }

  if (h1Positions.length === 0) {
    return [];
  }

  // Preamble = everything before the first Heading 1 (title page, TOC, etc.)
  const preamble = bodyXml.slice(0, h1Positions[0].start);

  for (let i = 0; i < h1Positions.length; i++) {
    const h1 = h1Positions[i];
    const nextStart = i + 1 < h1Positions.length ? h1Positions[i + 1].start : bodyXml.length;
    sections.push({
      preambleXml: i === 0 ? preamble : '',
      headingXml: bodyXml.slice(h1.start, h1.end),
      headingText: h1.text,
      contentXml: bodyXml.slice(h1.end, nextStart),
    });
  }

  return sections;
}

/**
 * Match a section heading from the template against the user's selected sections.
 * Returns the matched selected section or null.
 */
function matchSectionToSelected(
  headingText: string,
  selectedSections: { number: string; title: string }[],
): { number: string; title: string } | null {
  const normalized = headingText.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const sel of selectedSections) {
    // Try matching by title (fuzzy — the template heading may include the section number)
    const selTitle = sel.title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized === selTitle || normalized.includes(selTitle) || selTitle.includes(normalized)) {
      return sel;
    }
    // Try matching with number prefix: "1. Executive Summary" or "1 Executive Summary"
    const withNumber = `${sel.number} ${selTitle}`;
    const withNumberDot = `${sel.number}. ${selTitle}`;
    if (normalized.includes(withNumber) || normalized.includes(withNumberDot)) {
      return sel;
    }
  }
  return null;
}

interface MdSection {
  /** Section number (e.g. "1", "2") */
  number: string;
  /** Section title */
  title: string;
  /** Markdown body content (everything below the heading) */
  body: string;
}

/**
 * Split the generated Markdown into sections by top-level headings (## headings).
 * The assembleMarkdown function uses ## for depth-1 sections.
 */
function splitMarkdownBySections(markdown: string): MdSection[] {
  const sections: MdSection[] = [];
  const lines = markdown.split('\n');
  let current: MdSection | null = null;
  let bodyLines: string[] = [];

  for (const line of lines) {
    // Match ## N Title (the format from assembleMarkdown: depth 1 = ##)
    const headingMatch = line.match(/^##\s+(\d+(?:\.\d+)*)\s+(.+)/);
    if (headingMatch) {
      if (current) {
        current.body = bodyLines.join('\n').trim();
        sections.push(current);
      }
      current = { number: headingMatch[1], title: headingMatch[2].trim(), body: '' };
      bodyLines = [];
    } else if (current) {
      bodyLines.push(line);
    }
  }

  if (current) {
    current.body = bodyLines.join('\n').trim();
    sections.push(current);
  }

  return sections;
}

/**
 * Find the generated Markdown content for a given selected section.
 */
function findMarkdownForSection(
  selected: { number: string; title: string },
  mdSections: MdSection[],
): string | null {
  // Try exact number match first
  for (const md of mdSections) {
    if (md.number === selected.number) return md.body;
  }
  // Try title match
  const selTitle = selected.title.trim().toLowerCase();
  for (const md of mdSections) {
    if (md.title.trim().toLowerCase() === selTitle) return md.body;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Markdown to OOXML conversion
// ---------------------------------------------------------------------------

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a Markdown body string (sub-section content, no top-level heading) into OOXML paragraphs.
 */
function markdownBodyToOoxml(
  markdown: string,
  headingStyles: Map<number, string>,
  listStyleId: string,
): string {
  const paragraphs: string[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading (### Sub-heading, #### etc.)
    const headingMatch = line.match(/^(#{1,6})\s+(?:\d+(?:\.\d+)*\s+)?(.+)/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const text = headingMatch[2].trim();
      // Sub-headings are one level deeper in Markdown than their target template level
      // because the parent ## heading was replaced by the template's Heading 1.
      // So ### (depth 3) → Heading 2, #### (depth 4) → Heading 3, etc.
      const templateLevel = Math.max(depth - 1, 2);
      const styleId = headingStyles.get(templateLevel) ?? headingStyles.get(2) ?? 'Heading2';
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` +
        inlineToRuns(text) +
        `</w:p>`
      );
      i++;
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="${listStyleId}"/>` +
        `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
        inlineToRuns(bulletMatch[1]) +
        `</w:p>`
      );
      i++;
      continue;
    }

    // Numbered list item
    const numMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="${listStyleId}"/>` +
        `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>` +
        inlineToRuns(numMatch[1]) +
        `</w:p>`
      );
      i++;
      continue;
    }

    // Table (starts with |)
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      paragraphs.push(markdownTableToOoxml(tableLines));
      continue;
    }

    // Regular paragraph
    paragraphs.push(
      `<w:p>` + inlineToRuns(line) + `</w:p>`
    );
    i++;
  }

  return paragraphs.join('');
}

/**
 * Convert inline Markdown (bold, italic, code) to OOXML runs.
 */
function inlineToRuns(text: string): string {
  const runs: string[] = [];
  // Split on inline patterns: **bold**, *italic*, `code`
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      if (before) runs.push(`<w:r><w:t xml:space="preserve">${xmlEscape(before)}</w:t></w:r>`);
    }

    if (match[2]) {
      // Bold+Italic: ***text***
      runs.push(`<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[2])}</w:t></w:r>`);
    } else if (match[3]) {
      // Bold: **text**
      runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[3])}</w:t></w:r>`);
    } else if (match[4]) {
      // Italic: *text*
      runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[4])}</w:t></w:r>`);
    } else if (match[5]) {
      // Code: `text`
      runs.push(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[5])}</w:t></w:r>`);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) runs.push(`<w:r><w:t xml:space="preserve">${xmlEscape(remaining)}</w:t></w:r>`);
  }

  // If no runs were produced, output at least an empty run for the full text
  if (runs.length === 0 && text.trim()) {
    runs.push(`<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`);
  }

  return runs.join('');
}

/**
 * Convert a Markdown table to OOXML <w:tbl>.
 */
function markdownTableToOoxml(tableLines: string[]): string {
  // Filter out separator lines (|---|---|)
  const dataLines = tableLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
  if (!dataLines.length) return '';

  const rows = dataLines.map(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return cells;
  });

  const colCount = rows[0]?.length ?? 1;
  const colWidthTwips = Math.floor(9000 / colCount); // ~15cm total, divided equally

  let xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '</w:tblBorders></w:tblPr>';

  for (let ri = 0; ri < rows.length; ri++) {
    const isHeader = ri === 0;
    xml += '<w:tr>';
    for (let ci = 0; ci < colCount; ci++) {
      const cellText = rows[ri]?.[ci] ?? '';
      xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidthTwips}" w:type="dxa"/></w:tcPr>`;
      if (isHeader) {
        xml += `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(cellText)}</w:t></w:r></w:p>`;
      } else {
        xml += `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(cellText)}</w:t></w:r></w:p>`;
      }
      xml += '</w:tc>';
    }
    xml += '</w:tr>';
  }

  xml += '</w:tbl>';
  return xml;
}
