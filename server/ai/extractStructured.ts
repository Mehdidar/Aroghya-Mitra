import { z } from 'zod';
import { parseJsonLoose } from './json';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Any text LLM: Sarvam chat, Claude or Gemini. Returns the raw reply text. */
export type LlmCall = (messages: LlmMessage[], opts: { signal?: AbortSignal }) => Promise<string>;

export interface ExtractOptions {
  llm: LlmCall;
  /** Task-specific system prompt. */
  instructions?: string;
  /** Hand-written description of the JSON shape. Clearer for models than a generated JSON Schema. */
  schemaHint?: string;
  /** Total attempts including the first (default 2: one repair round). */
  maxAttempts?: number;
  signal?: AbortSignal;
}

export class ExtractionError extends Error {
  readonly lastOutput: string;
  readonly issues: string[];
  constructor(message: string, lastOutput: string, issues: string[]) {
    super(message);
    this.name = 'ExtractionError';
    this.lastOutput = lastOutput;
    this.issues = issues;
  }
}

/**
 * Parse model output into a validated object, without calling a model.
 * Throws ExtractionError with readable issues.
 */
export function parseStructured<S extends z.ZodType>(raw: string, schema: S): z.infer<S> {
  let json: unknown;
  try {
    json = parseJsonLoose(raw);
  } catch (e) {
    throw new ExtractionError('Model output was not valid JSON', raw, [(e as Error).message]);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ExtractionError('Model output did not match the schema', raw, formatIssues(result.error));
  }
  return result.data;
}

/**
 * Ask an LLM to turn text into JSON matching `schema`. Invalid output gets
 * one repair round with the validation errors fed back to the model.
 */
export async function extractStructured<S extends z.ZodType>(
  text: string,
  schema: S,
  opts: ExtractOptions,
): Promise<z.infer<S>> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const shape = opts.schemaHint ?? describeSchema(schema);
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: [
        opts.instructions ?? 'Extract structured data from the user content.',
        'Reply with a single JSON object only: no prose and no markdown fences.',
        `The JSON must match this shape:\n${shape}`,
      ].join('\n\n'),
    },
    { role: 'user', content: text },
  ];

  let last: ExtractionError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await opts.llm(messages, { signal: opts.signal });
    try {
      return parseStructured(raw, schema);
    } catch (e) {
      if (!(e instanceof ExtractionError)) throw e;
      last = e;
      messages.push(
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `That reply was invalid:\n- ${e.issues.join('\n- ')}\nReturn the corrected JSON object only.`,
        },
      );
    }
  }
  throw last ?? new ExtractionError('Extraction failed', '', []);
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}

function describeSchema(schema: z.ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }), null, 2);
  } catch {
    return '(see instructions)';
  }
}
