import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { Proof } from '../src/index';

it('runs the stock pi hello extension inside a Durable Object agent', async () => {
  const response = await SELF.fetch('https://example.com/prove?name=test');
  const proof: Proof = await response.json();

  expect(proof.loadedTools).toEqual(['hello']);
  expect(proof.unsupported).toEqual([]);
  expect(proof.toolResult).toBe('Hello, durable pi!');
  expect(proof.answer).toBe('The extension said: Hello, durable pi!');
});
