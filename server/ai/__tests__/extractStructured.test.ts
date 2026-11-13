import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { extractStructured, ExtractionError, type LlmMessage } from '../extractStructured';
import { parseJsonLoose } from '../json';

describe('parseJsonLoose', () => {
  it('handles fences, prose and trailing commas', () => {
    assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonLoose('Sure! {"a": [1, 2,],} Hope this helps'), { a: [1, 2] });
    assert.throws(() => parseJsonLoose('no json here'), SyntaxError);
  });
});

describe('extractStructured', () => {
  const Schema = z.object({ name: z.string(), age: z.number().int() });

  it('repairs invalid output using the validation errors', async () => {
    const seen: LlmMessage[][] = [];
    const replies = ['{"name": "Asha", "age": "thirty"}', '{"name": "Asha", "age": 30}'];
    const result = await extractStructured('Asha is 30', Schema, {
      llm: async (messages) => {
        seen.push([...messages]);
        return replies.shift()!;
      },
    });
    assert.deepEqual(result, { name: 'Asha', age: 30 });
    assert.equal(seen.length, 2);
    const repair = seen[1].at(-1)!;
    assert.equal(repair.role, 'user');
    assert.match(repair.content, /age/);
  });

  it('throws ExtractionError after maxAttempts', async () => {
    await assert.rejects(
      extractStructured('x', Schema, { llm: async () => 'nope', maxAttempts: 2 }),
      (e: unknown) => e instanceof ExtractionError && e.lastOutput === 'nope',
    );
  });

  it('puts the schema hint in the system prompt', async () => {
    let system = '';
    await extractStructured('x', Schema, {
      schemaHint: '{ "name": string, "age": integer }',
      llm: async (messages) => {
        system = messages[0].content;
        return '{"name":"a","age":1}';
      },
    });
    assert.match(system, /"age": integer/);
  });
});
