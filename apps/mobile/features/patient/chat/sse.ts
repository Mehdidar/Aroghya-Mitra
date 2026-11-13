/** Reads `data: <json>` lines from a text/event-stream body. Works on a streaming body or on the full text (Jest, old fetch). */
export async function* readSse(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (body && typeof (body as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          const d = dataOf(line);
          if (d !== null) yield d;
        }
        if (done) {
          const d = dataOf(buf.replace(/\r$/, ''));
          if (d !== null) yield d;
          return;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return;
  }
  // No streaming support: parse the whole text once it arrives.
  const text = await res.text();
  for (const line of text.split('\n')) {
    const d = dataOf(line.replace(/\r$/, ''));
    if (d !== null) yield d;
  }
}

function dataOf(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  const d = line.slice(5).trimStart();
  return d === '[DONE]' ? null : d;
}
