'use strict';

/**
 * A run that holds a confined call open (Story 1.131), for the cases that kill it with SIGKILL.
 *
 *   killed-call.cjs <evaluation folder> <launch root> <ready file> <planting directory>
 *
 * It makes its private parent the way `preflight` does, with the ownership journal beside the evaluation's runs and the marker inside the parent.
 * It then makes a call through the layer's own code.
 * `createApiPort` starts a service's call, whose port directory and bridge directory it makes.
 * The confined command mechanism makes the call's temp directory before it starts the target, which here never answers.
 * Each of the three directories holds what a target could leave in a directory it may write: a link and a hard link to paths outside it, a directory it closed to itself, and a file shaped like the runtime's own ownership record, naming paths outside.
 * It writes the ready file, a JSON object naming the parent and the three directories, once all of that exists, and waits until it is killed.
 */

const fs = require('node:fs');
const path = require('node:path');

const repository = path.join(__dirname, '..', '..', '..');
const { confinedCommandMechanism } = require(path.join(repository, 'cli', 'lib', 'evaluate', 'confinement'));
const { createApiPort, probeHttpPort } = require(path.join(repository, 'cli', 'lib', 'evaluate', 'http-target'));
const { journalDirectory, makePrivateParent } = require(path.join(repository, 'cli', 'lib', 'evaluate', 'workspace'));

const [folder, root, ready, planting] = process.argv.slice(2);

/** What a target could write into a directory of its own call, aimed at what lies outside it. */
function plant(directory, parent) {
  fs.symlinkSync(planting, path.join(directory, 'link-out'));
  fs.symlinkSync(path.join(planting, 'dangling'), path.join(directory, 'link-dangling'));
  fs.linkSync(path.join(planting, 'canary.txt'), path.join(directory, 'hard-link'));
  fs.mkdirSync(path.join(directory, 'closed', 'inner'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'closed', 'inner', 'file'), 'closed\n');
  fs.chmodSync(path.join(directory, 'closed', 'inner'), 0o000);
  fs.chmodSync(path.join(directory, 'closed'), 0o000);
  const record = {
    version: 1,
    kind: 'private-parent',
    folder,
    root,
    runId: 'forged',
    ownerPid: 1,
    privateRoot: path.dirname(parent),
    directory: planting,
  };
  fs.writeFileSync(path.join(directory, '.tea-evaluate-private-owner.json'), `${JSON.stringify(record)}\n`);
  fs.writeFileSync(path.join(directory, `aux-${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.json`), `${JSON.stringify(record)}\n`);
}

async function main() {
  const runs = path.join(folder, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const journal = journalDirectory(runs);
  const scratch = [];
  const parent = makePrivateParent(scratch, { folder, root, journal, runId: 'killed-call' });
  const [entry] = JSON.parse(fs.readFileSync(path.join(folder, 'evaluation.json'), 'utf8')).registry;
  const httpPort = await probeHttpPort(folder);
  let held = null;
  // A Bubblewrap sandbox of the layer, as far as the call's directories are concerned: its `wrap` names the directories the call is handed.
  const sandbox = {
    mode: 'bubblewrap',
    home: null,
    wrap: (target, args, writable) => {
      held = writable;
      return { target, args, statusFile: null };
    },
    collect: async () => {},
  };
  const base = {
    run: (request) => {
      const [portDirectory, bridgeDirectory] = [path.dirname(request.portFile), path.dirname(request.bridge)];
      const temporary = held.at(-1);
      for (const directory of [portDirectory, bridgeDirectory, temporary]) plant(directory, parent);
      fs.writeFileSync(`${ready}.part`, JSON.stringify({ parent, portDirectory, bridgeDirectory, temporary }));
      fs.renameSync(`${ready}.part`, ready);
      return new Promise(() => {});
    },
  };
  const mechanism = confinedCommandMechanism(base, sandbox, () => [], scratch);
  await createApiPort({
    entries: [entry],
    httpPort,
    cwd: root,
    targetOf: () => path.join(root, 'server', 'grader.js'),
    readEnvironment: (names) => Object.fromEntries(names.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]])),
    mechanism,
    maxOutputBytes: 1024 * 1024,
    scratch,
  }).probe({
    probeId: 'killed-call-1',
    interfaceId: 'grader',
    operationId: 'grade-answer',
    kind: 'api',
    method: 'GET',
    pathTemplate: '/grade',
    channels: { path: {}, query: { answer: 'forty-two' }, header: {}, body: { kind: 'absent' } },
  });
}

main().catch((error) => {
  process.stderr.write(`killed-call: ${error.stack}\n`);
  process.exit(3);
});
