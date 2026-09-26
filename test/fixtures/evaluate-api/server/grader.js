#!/usr/bin/env node
/**
 * A loopback HTTP service, the system under test of Story 1.11's fixture:
 * plain Node `http`, no framework, listening on 127.0.0.1 at the port its
 * `PORT` environment variable names. With `PORT` 0 and `PORT_FILE` naming a
 * file, it binds a port the system chooses and writes that port's number to
 * the file once it listens (Story 1.37's handoff, which the fixture's
 * registry names); with a port in `PORT`, it listens there (the chosen-port
 * handoff).
 *
 * It answers:
 *
 *   GET /grade?answer=<text>   { ok, answer, verdict }: the verdict is accepted
 *                              under `mode: strict` in the policy file and
 *                              rejected under `mode: lenient`, the mutation
 *                              M-001 plants; with no answer, 400 and ok false
 *   GET /policy                { ok, mode }
 *   anything else              404
 *
 * The policy file is the one its `--policy=<path>` argument names, relative to
 * its working directory (the fixture's registry passes
 * `--policy=rules/policy.txt`); started without the argument, with no
 * `PORT`, or with `PORT` 0 and no `PORT_FILE`, it exits 2 before it listens,
 * so a registry that dropped its `targetArgs`, its `portEnvironmentKey` or
 * its `portFileEnvironmentKey` cannot pass.
 *
 * When GRADER_TOKEN is set, every request must carry `authorization: Bearer
 * <token>`, and one that does not is answered 401, so a test sees the
 * registry's auth header reach the service. When GRADER_SECRET is set, a
 * grade echoes it as `secret`, and `/policy` echoes the token as `token`, for
 * a test that the runtime scrubs both from what it records.
 *
 * When GRADER_LOG names a file, the service appends one JSON line when it
 * listens (`event: listen`, with the port it bound and the handoff it was
 * started with, `port-file` or `chosen`) and one per request (`event: request`, the method,
 * the path and query, whether the auth header matched), each with the
 * workspace label of its working directory (`workspace`) and of the directory
 * it was started from (`scriptWorkspace`), and its pid, so a test reads from
 * the service's own log which calls reached it and where it ran.
 *
 * It runs through its `#!/usr/bin/env node` line, so the host's PATH must
 * resolve `node`, as eval-quality starts a target with the host's PATH.
 *
 * Policy lines drive the failure cases:
 *
 *   start: fail       exit 3 before listening, a server that cannot start
 *   start: delay <ms> listen only after that many milliseconds, a slow start
 *   hang: <path>      log a request for that path and never answer it
 *   crash: <path>     log a request for that path and exit 3 without answering
 *   verdict: accept   answer accepted whatever the mode says
 *   port: none        listen and write no port to PORT_FILE
 *   port: text        listen and write `not-a-port` to PORT_FILE
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const policyFile = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--policy='))
  ?.slice('--policy='.length);
const port = Number(process.env.PORT);
const portFile = process.env.PORT_FILE;
if (policyFile === undefined || !Number.isInteger(port) || port < 0 || (port === 0 && !portFile) || process.env.PORT === '') {
  process.stderr.write('grader: no --policy=<path> argument, no PORT, or PORT 0 with no PORT_FILE\n');
  process.exit(2);
}
const policy = fs.existsSync(policyFile) ? fs.readFileSync(policyFile, 'utf8') : '';
const mode = /mode: (\w+)/.exec(policy)?.[1] ?? 'unknown';
const hanging = new Set([...policy.matchAll(/^hang: (\S+)$/gm)].map((match) => match[1]));
const crashing = new Set([...policy.matchAll(/^crash: (\S+)$/gm)].map((match) => match[1]));
const startDelayMs = Number(/^start: delay (\d+)$/m.exec(policy)?.[1] ?? 0);
const portReport = /^port: (none|text)$/m.exec(policy)?.[1] ?? null;

/** The runtime label of the workspace a directory lies in (`trial-clean-2` for tea-evaluate-trial-clean-2-XXXXXX/target), or null. */
const labelOf = (directory) => /^tea-evaluate-(.+)-[A-Za-z0-9]{6}$/.exec(path.basename(path.dirname(directory)))?.[1] ?? null;
const workspace = labelOf(process.cwd());
/** The workspace this script was started from, which the registry resolves its target into. */
const scriptWorkspace = labelOf(path.dirname(__dirname));

function log(entry) {
  if (process.env.GRADER_LOG) {
    fs.appendFileSync(process.env.GRADER_LOG, `${JSON.stringify({ ...entry, workspace, scriptWorkspace, pid: process.pid })}\n`);
  }
}

if (policy.includes('start: fail')) {
  process.stderr.write(`grader: refusing to start${process.env.GRADER_SECRET ? ` (${process.env.GRADER_SECRET})` : ''}\n`);
  process.exit(3);
}

function answer(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://grader');
  const token = process.env.GRADER_TOKEN;
  const authorized = token === undefined || request.headers.authorization === `Bearer ${token}`;
  log({ event: 'request', method: request.method, path: `${url.pathname}${url.search}`, authorized });
  if (hanging.has(url.pathname)) return;
  if (crashing.has(url.pathname)) process.exit(3);
  if (!authorized) {
    answer(response, 401, { ok: false, error: 'unauthorized' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/grade') {
    const graded = url.searchParams.get('answer');
    if (graded === null) {
      answer(response, 400, { ok: false, error: 'no answer to grade' });
      return;
    }
    let verdict = mode === 'strict' ? 'accepted' : mode === 'lenient' ? 'rejected' : 'unknown';
    if (policy.includes('verdict: accept')) verdict = 'accepted';
    answer(response, 200, {
      ok: true,
      answer: graded,
      verdict,
      ...(process.env.GRADER_SECRET ? { secret: process.env.GRADER_SECRET } : {}),
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/policy') {
    answer(response, 200, { ok: true, mode, ...(token === undefined ? {} : { token }) });
    return;
  }
  answer(response, 404, { ok: false, error: 'not found' });
});

/** Reports the port the service bound in PORT_FILE, as its policy says. */
function reportPort(bound) {
  if (!portFile || portReport === 'none') return;
  fs.writeFileSync(portFile, portReport === 'text' ? 'not-a-port\n' : `${bound}\n`);
}

setTimeout(
  () =>
    server.listen(port, '127.0.0.1', () => {
      const bound = server.address().port;
      reportPort(bound);
      log({ event: 'listen', port: bound, handoff: portFile ? 'port-file' : 'chosen' });
    }),
  startDelayMs,
);
