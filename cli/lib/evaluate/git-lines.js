/**
 * Reads a git answer that can be larger than any buffer, as a stream, and prints
 * only the part the caller keeps (Story 1.80).
 *
 * `createWorkspace` is synchronous and `spawnSync` holds a command's whole output
 * in memory, so a walk over a very large history (more than six million objects
 * print more than 256 MB of ids) would exceed any fixed buffer. The runtime runs
 * this script under the supervisor instead, and the script runs git, reads its
 * output as it arrives and keeps one line in memory at a time. What it prints is
 * bounded by what the caller asks to keep.
 *
 * Usage: `node git-lines.js`, with the job as JSON on standard input, where the job is one of:
 *
 * - `{ "mode": "missing", "git": [args], "keep": [ids] | null }`: runs `git <args>` (a
 *   `rev-list --objects --missing=print` walk) and prints the id of each line that
 *   starts with `?`, which git prints for an object it could not read. With a `keep`
 *   list of ids only those ids are printed.
 * - `{ "mode": "reached", "git": [args], "revs": [lines] }`: runs `git <args>` (a
 *   `rev-list --objects --missing=print --stdin`) with `revs` on its standard input and prints the id of each
 *   line that does not start with `?`, the objects git could read.
 * - `{ "mode": "trees", "list": [args], "ask": [args], "path": "<path>" }`: runs `git <list>` (a
 *   `rev-list` of commits) and feeds `<commit>:<path>` for each commit to
 *   `git <ask>` (a `cat-file --batch-check`), and prints each distinct id that
 *   git answers is a tree.
 *
 * - `{ "mode": "pack", "stages": [[args], ...], "revs": [lines] }`: runs each `git <args>` as one stage of a pipeline, with
 *   `revs` on the first stage's standard input and each stage's standard output piped into the next one's, and prints nothing.
 *   The build's stages are a walk or a `pack-objects --stdout` in the adopter's repository (a partial clone needs the walk:
 *   `pack-objects --revs` stops at a tree the project does not hold, and `rev-list --missing=allow-any` walks past it) and
 *   an `index-pack --stdin` in the private repository, which writes its pack on its own device, so nothing is written to
 *   the adopter's object store.
 *
 * The exit status is git's own, a failed stage's standard error reaches the
 * caller, and nothing is printed on failure.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

/** Calls `onLine(line)` for each line of `stream`, as it arrives; a final line with no newline counts. */
function eachLine(stream, onLine, onEnd) {
  let rest = '';
  stream.setEncoding('latin1');
  stream.on('data', (chunk) => {
    let start = 0;
    for (let newline = chunk.indexOf('\n'); newline !== -1; newline = chunk.indexOf('\n', start)) {
      onLine(rest + chunk.slice(start, newline));
      rest = '';
      start = newline + 1;
    }
    rest += chunk.slice(start);
  });
  stream.on('end', () => {
    if (rest.length > 0) onLine(rest);
    onEnd();
  });
}

function fail(status, message) {
  if (message) process.stderr.write(`${message}\n`);
  process.exit(status === 0 ? 1 : status);
}

/** The git subcommand an argument list runs (`rev-list`, `cat-file`, `pack-objects`), for a message that names the stage. */
function stageOf(args) {
  return `git ${args.find((argument) => /^[a-z][a-z-]*$/.test(argument)) ?? 'command'}`;
}

/**
 * How a stage ended: its status (the shell's `128 + signal` for a stage a signal killed) and, for a failure, the sentence
 * that names the stage and the signal or code.
 */
function outcome(stage, code, signal) {
  if (code === 0) return { status: 0, note: '' };
  if (code === null && signal !== null) {
    return { status: 128 + (os.constants.signals[signal] ?? 0), note: `${stage} was killed by ${signal}` };
  }
  return { status: code ?? 1, note: `${stage} exited ${code ?? 'with no status'}` };
}

function missing(job) {
  const keep = job.keep === null ? null : new Set(job.keep);
  const kept = [];
  const child = spawn('git', job.git, { stdio: ['ignore', 'pipe', 'inherit'] });
  child.on('error', (error) => fail(1, `git could not run: ${error.code ?? error.message}`));
  let drained = false;
  let ended = null;
  const finish = () => {
    if (!drained || ended === null) return;
    if (ended.status !== 0) fail(ended.status, ended.note);
    process.stdout.write(kept.map((id) => `${id}\n`).join(''), () => process.exit(0));
  };
  eachLine(
    child.stdout,
    (line) => {
      if (line.codePointAt(0) !== 63) return;
      const id = line.slice(1).trim();
      if (keep === null || keep.has(id)) kept.push(id);
    },
    () => {
      drained = true;
      finish();
    },
  );
  child.on('close', (code, signal) => {
    ended = outcome(stageOf(job.git), code, signal);
    finish();
  });
}

function reached(job) {
  const kept = [];
  const child = spawn('git', job.git, { stdio: ['pipe', 'pipe', 'inherit'] });
  child.on('error', (error) => fail(1, `git could not run: ${error.code ?? error.message}`));
  child.stdin.on('error', () => {});
  child.stdin.end(`${job.revs.join('\n')}\n`);
  let drained = false;
  let ended = null;
  const finish = () => {
    if (!drained || ended === null) return;
    if (ended.status !== 0) fail(ended.status, ended.note);
    process.stdout.write(kept.map((id) => `${id}\n`).join(''), () => process.exit(0));
  };
  eachLine(
    child.stdout,
    (line) => {
      if (line.length > 0 && line.codePointAt(0) !== 63) kept.push(line.trim());
    },
    () => {
      drained = true;
      finish();
    },
  );
  child.on('close', (code, signal) => {
    ended = outcome(stageOf(job.git), code, signal);
    finish();
  });
}

function trees(job) {
  const found = new Set();
  const list = spawn('git', job.list, { stdio: ['ignore', 'pipe', 'inherit'] });
  const ask = spawn('git', job.ask, { stdio: ['pipe', 'pipe', 'inherit'] });
  list.on('error', (error) => fail(1, `git could not run: ${error.code ?? error.message}`));
  ask.on('error', (error) => fail(1, `git could not run: ${error.code ?? error.message}`));
  ask.stdin.on('error', () => {});
  const state = { list: null, ask: null, answers: false, delivered: false, sent: 0, answered: 0, failure: null };
  const finish = () => {
    if (state.list === null || state.ask === null || !state.answers) return;
    if (state.failure !== null) fail(state.failure.status, state.failure.note);
    process.stdout.write([...found].map((id) => `${id}\n`).join(''), () => process.exit(0));
  };
  let batch = [];
  const flush = () => {
    if (batch.length === 0) return true;
    const writable = ask.stdin.write(batch.join(''));
    batch = [];
    return writable;
  };
  eachLine(
    list.stdout,
    (line) => {
      batch.push(`${line}:${job.path}\n`);
      state.sent++;
      if (batch.length >= 4096 && !flush()) {
        list.stdout.pause();
        ask.stdin.once('drain', () => list.stdout.resume());
      }
    },
    () => {
      flush();
      state.delivered = true;
      ask.stdin.end();
    },
  );
  eachLine(
    ask.stdout,
    (line) => {
      state.answered++;
      // Only a tree's own answer counts: the answer for a path that is missing begins with the path, which can hold a
      // space and the word `tree`.
      const answer = /^([0-9a-f]{40}|[0-9a-f]{64}) tree \d+$/.exec(line);
      if (answer !== null) found.add(answer[1]);
    },
    () => {
      state.answers = true;
      finish();
    },
  );
  list.on('close', (code, signal) => {
    state.list = outcome(stageOf(job.list), code, signal);
    if (state.list.status !== 0) {
      state.failure ??= state.list;
      ask.kill('SIGKILL');
    }
    finish();
  });
  ask.on('close', (code, signal) => {
    state.ask = outcome(stageOf(job.ask), code, signal);
    // A stage that exits cleanly before the whole list was handed to it, or without answering every line it was sent
    // (`cat-file --batch-check` answers each line it reads, `missing` included), answered for part of the history.
    if (state.ask.status === 0 && !state.delivered) {
      state.ask = { status: 1, note: `${stageOf(job.ask)} ended before the commit list was handed to it` };
    } else if (state.ask.status === 0 && state.answered !== state.sent) {
      state.ask = { status: 1, note: `${stageOf(job.ask)} answered ${state.answered} of ${state.sent} lines` };
    }
    if (state.ask.status !== 0) {
      state.failure ??= state.ask;
      list.kill('SIGKILL');
      // A list that has already exited can still hold its output open through a child, paused for input nobody drains.
      list.stdout.destroy();
    }
    finish();
  });
}

function pack(job) {
  const stages = job.stages.map((args, index) =>
    spawn('git', args, { stdio: ['pipe', index === job.stages.length - 1 ? 'ignore' : 'pipe', 'inherit'] }),
  );
  const state = { ended: Array.from({ length: stages.length }, () => null), failure: null };
  stages[0].stdin.end(`${job.revs.join('\n')}\n`);
  for (const [index, stage] of stages.entries()) {
    stage.on('error', (error) => fail(1, `git could not run: ${error.code ?? error.message}`));
    stage.stdin.on('error', () => {});
    if (index > 0) stages[index - 1].stdout.pipe(stage.stdin);
  }
  const finish = () => {
    if (state.ended.includes(null)) return;
    if (state.failure !== null) fail(state.failure.status, state.failure.note);
    process.exit(0);
  };
  // A stage that ends badly stops the others, which would otherwise wait on a pipe nobody reads or writes.
  // A stage ends on its `exit`: `close` waits for the stage's standard output to be read to its end, and the pipe into the next
  // stage stops reading once that stage has exited, so a stage whose last bytes were still unread (or whose child held the
  // pipe open) never closed, the event loop ran dry and the job exited 0 with the pack never built.
  for (const [index, stage] of stages.entries()) {
    stage.on('exit', (code, signal) => {
      state.ended[index] = outcome(stageOf(job.stages[index]), code, signal);
      if (state.ended[index].status !== 0) {
        state.failure ??= state.ended[index];
        for (const other of stages) if (other !== stage) other.kill('SIGKILL');
      }
      finish();
    });
  }
}

// The job arrives on standard input: a pack job's revisions can outgrow one argument.
const job = JSON.parse(fs.readFileSync(0, 'utf8'));
switch (job.mode) {
  case 'missing': {
    missing(job);
    break;
  }
  case 'reached': {
    reached(job);
    break;
  }
  case 'trees': {
    trees(job);
    break;
  }
  case 'pack': {
    pack(job);
    break;
  }
  default: {
    fail(2, `unknown mode ${JSON.stringify(job.mode)}`);
  }
}
