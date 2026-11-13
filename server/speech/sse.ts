/** Minimal Server-Sent Events reader for OpenAI-style streams (`data: {...}` lines, ending with `[DONE]`). */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const data = dataOf(line);
        if (data === null) continue;
        if (data === '[DONE]') return;
        yield data;
      }
      if (done) {
        const data = dataOf(buffer.replace(/\r$/, ''));
        if (data !== null && data !== '[DONE]') yield data;
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function dataOf(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  return line.slice(5).trimStart();
}
