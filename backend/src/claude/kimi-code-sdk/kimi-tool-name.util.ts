/**
 * Kimi names its built-in tools in PascalCase-ish CLI style (`WriteFile`,
 * `StrReplaceFile`, `Shell`, ...) while the frontend timeline and the
 * interceptor/event consumers key off the Claude Code names (`Write`, `Edit`,
 * `Bash`, ...). Normalizing here lets the existing UI components render Kimi
 * tool calls without any frontend changes.
 *
 * The map is doc-derived and refined from isolated-test event dumps
 * (test/kimi-code-isolated.ts prints every raw ToolCall). Unknown names
 * (MCP tools, external tools) pass through unchanged.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  writefile: 'Write',
  write_file: 'Write',
  createfile: 'Write',
  strreplacefile: 'Edit',
  str_replace_file: 'Edit',
  editfile: 'Edit',
  patch: 'Edit',
  readfile: 'Read',
  read_file: 'Read',
  shell: 'Bash',
  bash: 'Bash',
  glob: 'Glob',
  grep: 'Grep',
  search: 'Grep',
  todo: 'TodoWrite',
  settodolist: 'TodoWrite',
  set_todo_list: 'TodoWrite',
  task: 'Task',
  websearch: 'WebSearch',
  web_search: 'WebSearch',
  webfetch: 'WebFetch',
  fetchurl: 'WebFetch',
  fetch_url: 'WebFetch',
  skill: 'Skill',
};

export function normalizeKimiToolName(name?: string): string {
  if (!name) return 'unknown';
  return TOOL_NAME_MAP[name.toLowerCase()] ?? name;
}
