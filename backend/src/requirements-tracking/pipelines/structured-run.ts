import { ZodTypeAny, infer as zInfer } from 'zod';
import { LlmService, ModelTier } from '../../llm/llm.service';
import { tryParseLlmJson } from '../../mcpserver/document-analysis-tools';

/**
 * Generic schema-constrained pipeline run — the generalization of
 * document-analysis-tools.ts::extractStructured (the proven pattern) plus
 * pipeline-specific deterministic post-validators with the spec's
 * one-retry-with-the-error-appended contract (§3.3 determinism aids).
 *
 * Primary path: generateObject (provider-enforced JSON). Fallback (providers
 * without trustworthy tool-mode JSON): generateText + salvage parse + safeParse.
 * Post-validators run on schema-valid data; a failing validator triggers a
 * retry with the validation message appended so the model can self-correct.
 */

export interface StructuredRunOutcome<T> {
  data: T | null;
  ok: boolean;
  attempts: number;
  error?: string;
}

export type PostValidator<T> = (data: T) => string | null; // null = valid, string = error fed back

export async function runStructured<S extends ZodTypeAny>(
  llm: LlmService,
  opts: {
    schema: S;
    systemPrompt: string;
    userMessage: string;
    tier: ModelTier;
    maxOutputTokens?: number;
    temperature?: number;
    retries?: number;
    postValidators?: Array<PostValidator<zInfer<S>>>;
    projectDir?: string;
  },
): Promise<StructuredRunOutcome<zInfer<S>>> {
  type T = zInfer<S>;
  const retries = opts.retries ?? 2;
  const useStructured = llm.supportsStructuredOutput();
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const user = lastError
      ? `${opts.userMessage}\n\n# Previous attempt failed: ${lastError}\n# Re-emit ONLY valid JSON matching the schema, correcting the error. Do not truncate.`
      : opts.userMessage;

    let candidate: T | null = null;
    try {
      if (useStructured) {
        candidate = await llm.generateObjectWithMessages<T>({
          tier: opts.tier,
          schema: opts.schema,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: user },
          ],
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          temperature: opts.temperature ?? 0,
          projectDir: opts.projectDir,
        });
      } else {
        const raw = await llm.generateTextWithMessages({
          tier: opts.tier,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: user },
          ],
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          temperature: opts.temperature ?? 0,
          projectDir: opts.projectDir,
        });
        const parsed = tryParseLlmJson(raw);
        if (parsed === null) {
          lastError = 'response was not valid/complete JSON';
          continue;
        }
        const validation = opts.schema.safeParse(parsed);
        if (!validation.success) {
          lastError = validation.error.message.slice(0, 400);
          continue;
        }
        candidate = validation.data as T;
      }
    } catch (error: any) {
      lastError = String(error?.message ?? error).slice(0, 400);
      continue;
    }

    // deterministic server-side checks (quote-substring, one-shall, scope-exclusion, …)
    const validatorError = runPostValidators(candidate, opts.postValidators);
    if (validatorError) {
      lastError = validatorError;
      continue;
    }
    return { data: candidate, ok: true, attempts: attempt + 1 };
  }

  return { data: null, ok: false, attempts: retries + 1, error: lastError };
}

function runPostValidators<T>(
  data: T,
  validators?: Array<PostValidator<T>>,
): string | null {
  if (!validators) return null;
  for (const validator of validators) {
    const error = validator(data);
    if (error) return error;
  }
  return null;
}
