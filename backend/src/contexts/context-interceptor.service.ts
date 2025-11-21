import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ContextsService, ContextScope } from './contexts.service';
import { SessionsService } from '../sessions/sessions.service';
import { safeRoot } from '../claude/utils/path.utils';

interface ToolValidationResult {
  allowed: boolean;
  reason?: string;
}

interface CachedScope {
  scope: ContextScope;
  contextName: string;
  timestamp: number;
}

@Injectable()
export class ContextInterceptorService {
  private readonly logger = new Logger(ContextInterceptorService.name);
  private readonly scopeCache = new Map<string, CachedScope>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private readonly contextsService: ContextsService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Get cached scope or load from database
   */
  private async getContextScope(
    projectName: string,
    contextId: string,
  ): Promise<{ scope: ContextScope; contextName: string } | null> {
    const cacheKey = `${projectName}:${contextId}`;
    const cached = this.scopeCache.get(cacheKey);

    // Return cached if valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return { scope: cached.scope, contextName: cached.contextName };
    }

    // Load fresh scope
    const context = await this.contextsService.getContext(projectName, contextId);
    if (!context) {
      return null;
    }

    const scope = await this.contextsService.getContextScope(projectName, contextId);
    if (!scope) {
      return null;
    }

    // Cache it
    this.scopeCache.set(cacheKey, {
      scope,
      contextName: context.name,
      timestamp: Date.now(),
    });

    return { scope, contextName: context.name };
  }

  /**
   * Get active context for a session
   */
  async getActiveContextForSession(
    projectName: string,
    sessionId: string,
  ): Promise<string | null> {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.sessionsService.getActiveContext(projectRoot, sessionId);
    } catch (error) {
      this.logger.error(`Failed to get active context for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Validate tool use based on active context
   */
  async validateToolUse(
    projectName: string,
    sessionId: string,
    toolName: string,
    toolInput: any,
  ): Promise<ToolValidationResult> {
    // Get active context
    const contextId = await this.getActiveContextForSession(projectName, sessionId);

    // No active context = default context = no restrictions
    if (!contextId) {
      return { allowed: true };
    }

    // Load context scope
    const contextData = await this.getContextScope(projectName, contextId);
    if (!contextData) {
      // Context was deleted, revert to default
      this.logger.warn(`Context ${contextId} not found, allowing operation (default context)`);
      return { allowed: true };
    }

    // Validate based on tool type
    switch (toolName) {
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'NotebookEdit':
        return this.validateFileAccess(
          projectName,
          contextData,
          toolInput.file_path || toolInput.notebook_path,
        );

      case 'Glob':
        // Option B: Allow Glob, filter results in PostToolUse
        return { allowed: true };

      case 'Grep':
        return this.validateGrepAccess(projectName, contextData, toolInput.path);

      case 'Bash':
        // Option B: Log but don't validate (trust system prompt)
        this.logger.log(
          `[Context: ${contextData.contextName}] Bash command executed: ${toolInput.command}`,
        );
        return { allowed: true };

      default:
        // Other tools (Task, Skill, WebFetch, etc.) not restricted
        return { allowed: true };
    }
  }

  /**
   * Validate file access
   */
  private async validateFileAccess(
    projectName: string,
    contextData: { scope: ContextScope; contextName: string },
    filePath: string,
  ): Promise<ToolValidationResult> {
    const { scope, contextName } = contextData;

    // Check if file is in scope
    const isInScope = scope.files.includes(filePath);

    if (!isInScope) {
      const availableFilesCount = scope.files.length;
      return {
        allowed: false,
        reason: `File "${filePath}" is outside the active context "${contextName}". This context has access to ${availableFilesCount} file(s). Please switch contexts or ask the user to modify the context scope to include this file.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Validate Grep access
   */
  private async validateGrepAccess(
    projectName: string,
    contextData: { scope: ContextScope; contextName: string },
    searchPath?: string,
  ): Promise<ToolValidationResult> {
    // If no path specified, Grep searches current directory
    if (!searchPath) {
      // Allow but will be filtered in PostToolUse
      return { allowed: true };
    }

    // If path is specified, validate it
    return this.validateFileAccess(projectName, contextData, searchPath);
  }

  /**
   * Filter tool results based on context
   */
  async filterToolResults(
    projectName: string,
    sessionId: string,
    toolName: string,
    toolOutput: any,
  ): Promise<any> {
    // Get active context
    const contextId = await this.getActiveContextForSession(projectName, sessionId);

    // No active context = no filtering
    if (!contextId) {
      return toolOutput;
    }

    // Load context scope
    const contextData = await this.getContextScope(projectName, contextId);
    if (!contextData) {
      return toolOutput;
    }

    // Filter based on tool type
    switch (toolName) {
      case 'Glob':
        return this.filterGlobResults(contextData, toolOutput);

      case 'Grep':
        return this.filterGrepResults(contextData, toolOutput);

      default:
        return toolOutput;
    }
  }

  /**
   * Filter Glob results to only include files in scope
   */
  private filterGlobResults(
    contextData: { scope: ContextScope; contextName: string },
    results: any,
  ): any {
    if (typeof results === 'string') {
      // Single file path
      return contextData.scope.files.includes(results) ? results : null;
    }

    if (Array.isArray(results)) {
      // Array of file paths
      const filtered = results.filter((filePath) => contextData.scope.files.includes(filePath));
      this.logger.log(
        `[Context: ${contextData.contextName}] Filtered Glob results: ${results.length} → ${filtered.length}`,
      );
      return filtered;
    }

    return results;
  }

  /**
   * Filter Grep results to only include matches in scoped files
   */
  private filterGrepResults(
    contextData: { scope: ContextScope; contextName: string },
    results: any,
  ): any {
    if (typeof results === 'object' && results.files) {
      // Grep with files_with_matches mode
      const filtered = results.files.filter((filePath: string) =>
        contextData.scope.files.includes(filePath),
      );
      return { ...results, files: filtered };
    }

    if (typeof results === 'object' && results.matches) {
      // Grep with content mode
      const filtered = results.matches.filter(
        (match: any) => contextData.scope.files.includes(match.file),
      );
      return { ...results, matches: filtered };
    }

    return results;
  }

  /**
   * Build context-aware system prompt injection
   */
  async buildContextPromptInjection(
    projectName: string,
    sessionId: string,
  ): Promise<string | null> {
    const contextId = await this.getActiveContextForSession(projectName, sessionId);

    if (!contextId) {
      return null; // No injection for default context
    }

    const contextData = await this.getContextScope(projectName, contextId);
    if (!contextData) {
      return null;
    }

    const { scope, contextName } = contextData;

    return `
=== ACTIVE CONTEXT: "${contextName}" ===

IMPORTANT ACCESS RESTRICTIONS:
- You are operating in a SCOPED CONTEXT with limited file access
- You have access to ${scope.files.length} file(s) in this context
- All other files are OFF-LIMITS and will be blocked
- If you need a file outside this scope, inform the user and ask them to switch contexts

AVAILABLE FILES:
${scope.files.slice(0, 50).join('\n')}${scope.files.length > 50 ? `\n... and ${scope.files.length - 50} more files` : ''}

VECTOR STORE SCOPE:
- Document tags: ${scope.vectorTags.length > 0 ? scope.vectorTags.join(', ') : 'All documents accessible'}

KNOWLEDGE GRAPH SCOPE:
- Entity types: ${scope.kgEntityTypes.length > 0 ? scope.kgEntityTypes.join(', ') : 'All entity types'}
- Entity tags: ${scope.kgTags.length > 0 ? scope.kgTags.join(', ') : 'All entities accessible'}

When you encounter access restrictions, politely inform the user and suggest they either:
1. Switch to a different context that includes the needed resources
2. Ask them to modify the current context to include the needed files
3. Work within the available scope

===============================
`.trim();
  }

  /**
   * Clear cache (useful when contexts are updated)
   */
  clearCache(projectName?: string, contextId?: string): void {
    if (projectName && contextId) {
      this.scopeCache.delete(`${projectName}:${contextId}`);
    } else {
      this.scopeCache.clear();
    }
  }
}
