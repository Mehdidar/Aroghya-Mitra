/**
 * Pull a JSON value out of LLM output that may be wrapped in ```json fences,
 * prefixed with prose, or have trailing commas.
 */
export function parseJsonLoose(raw: string): unknown {
  const text = raw.trim();
  const attempts: string[] = [text];

  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1].trim());

  const sliced = sliceOutermost(text);
  if (sliced) attempts.push(sliced);

  for (const candidate of attempts) {
    for (const variant of [candidate, stripTrailingCommas(candidate)]) {
      try {
        return JSON.parse(variant);
      } catch {
        // try the next one
      }
    }
  }
  throw new SyntaxError('No valid JSON object found in model output');
}

/** From the first { or [ to the last matching } or ]. */
function sliceOutermost(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const close = text[start] === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  return end > start ? text.slice(start, end + 1) : null;
}

function stripTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1');
}
