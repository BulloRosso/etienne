/**
 * Lightweight Handlebars-subset interpolation for CLAUDE.md / AGENTS.md templates.
 *
 * Supports:
 *   - {{var}}                              variable substitution
 *   - {{#if expr}} ... {{/if}}             conditional block
 *   - {{#unless expr}} ... {{/unless}}     inverse conditional
 *
 * Conditional expressions support exactly two shapes (sufficient for the
 * onboarding seed's role branching):
 *   - {{#if user_role}}                    truthy check on a variable
 *   - {{#if user_role==='user'}}           strict equality with a string literal
 *
 * Design choices:
 *   - Pure function, no Handlebars dependency, no I/O.
 *   - Unknown variables are left as-is (`{{undefined_var}}` stays literal) so a
 *     malformed template never crashes a chat request.
 *   - Blocks do not nest. The seed has no nested branches; supporting nesting
 *     would warrant pulling in Handlebars proper.
 */

export interface PromptVars {
  user_name?: string;
  user_role?: string;
  user_display_name?: string;
  [key: string]: string | undefined;
}

const BLOCK_REGEX = /\{\{#(if|unless)\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const VAR_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function evaluateCondition(expr: string, vars: PromptVars): boolean {
  const equality = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*===\s*'([^']*)'$/);
  if (equality) {
    const [, name, literal] = equality;
    return vars[name] === literal;
  }

  const truthy = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (truthy) {
    const v = vars[truthy[1]];
    return typeof v === 'string' && v.length > 0;
  }

  // Unrecognised expression — fail closed (treat as false) so we never
  // accidentally surface a half-rendered branch.
  return false;
}

export function interpolatePromptVars(template: string, vars: PromptVars): string {
  if (!template) return template;

  const withBlocks = template.replace(BLOCK_REGEX, (_match, kind, expr, body) => {
    const truthy = evaluateCondition(expr.trim(), vars);
    const keep = kind === 'if' ? truthy : !truthy;
    return keep ? body : '';
  });

  return withBlocks.replace(VAR_REGEX, (match, name) => {
    const v = vars[name];
    return typeof v === 'string' ? v : match;
  });
}
