import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { test } from 'node:test';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function grade(port, answer) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/grade`, { method: 'POST', body: JSON.stringify({ answer }) });
      return await response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('the grader did not answer');
}

test('the grader rejects a restricted answer and accepts a long clean one', async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [new URL('./server/grade.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(port) } });
  try {
    assert.deepEqual(await grade(port, 'this answer is unsafe'), { decision: 'reject', reason: 'restricted-term' });
    assert.deepEqual(await grade(port, 'a perfectly fine answer'), { decision: 'pass', reason: 'accepted' });
  } finally {
    server.kill();
  }
});
