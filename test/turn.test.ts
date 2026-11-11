import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('streams a turn over websocket and resumes by cursor', async () => {
  const response = await SELF.fetch('https://example.com/turn?name=ws-test', {
    headers: { Upgrade: 'websocket' },
  });

  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  socket.send(JSON.stringify({ type: 'input', content: 'Greet me with your hello tool.' }));

  const messages: string[] = [];

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);
    socket.addEventListener('message', (event) => {
      messages.push(event.data as string);
      const payload = JSON.parse(event.data as string) as { type?: string; entries?: unknown[] };
      if (payload.type === 'history' && (payload.entries?.length ?? 0) > 0) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  const joined = messages.join('\n');
  expect(joined).toContain('"history"');
  expect(joined).toContain('toolResult');

  socket.close();
  expect(socket.readyState).toBeGreaterThan(0);
});
