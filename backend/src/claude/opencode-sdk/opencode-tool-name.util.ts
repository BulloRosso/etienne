/**
 * OpenCode names its built-in tools in lowercase (`todowrite`, `bash`, `edit`,
 * ...) while the frontend timeline and the interceptor/event consumers key off
 * the Claude Code names (`TodoWrite`, `Bash`, `Edit`, ...). Normalizing here
 * lets the existing UI components (e.g. the TodoWrite timeline) render
 * OpenCode tool calls without any frontend changes.
 *
 * Unknown names (MCP tools, plugin tools) pass through unchanged.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  todowrite: 'TodoWrite',
  todoread: 'TodoRead',
  bash: 'Bash',
  edit: 'Edit',
  write: 'Write',
  read: 'Read',
  glob: 'Glob',
  grep: 'Grep',
  list: 'List',
  webfetch: 'WebFetch',
  websearch: 'WebSearch',
  task: 'Task',
  skill: 'Skill',
  patch: 'Edit',
};

export function normalizeOpenCodeToolName(name?: string): string {
  if (!name) return 'unknown';
  return TOOL_NAME_MAP[name.toLowerCase()] ?? name;
}
