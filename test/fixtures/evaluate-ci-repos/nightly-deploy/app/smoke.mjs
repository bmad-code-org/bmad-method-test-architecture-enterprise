import { spawn } from 'node:child_process';

const port = 43000 + (process.pid % 1000);
const server = spawn(process.execPath, [new URL('./server/grade.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(port) } });
let decision;
for (let attempt = 0; attempt < 50 && decision === undefined; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/grade`, { method: 'POST', body: JSON.stringify({ answer: 'a perfectly fine answer' }) });
    decision = (await response.json()).decision;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
server.kill();
if (decision !== 'pass') {
  console.error(`smoke: expected pass, got ${decision}`);
  process.exit(1);
}
console.log('smoke: pass');
