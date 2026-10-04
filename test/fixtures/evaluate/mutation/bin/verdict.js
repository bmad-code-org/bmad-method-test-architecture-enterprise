#!/usr/bin/env node
/**
 * A stand-in target for `tea-evaluate preflight`'s mutation cases (Story 1.7):
 * a command that judges the request on its standard input by the policy in
 * `rules/policy.txt`, the file a controlled mutation edits.
 *
 * Every run prints, from its own working directory:
 *
 *   request: <the request>
 *   digest: sha256:<hex>        the SHA-256 of rules/policy.txt as it reads it,
 *                               evidence the runtime does not compute itself
 *   workspace: git-worktree | git-repository | plain
 *                               whether .git here is a worktree's file, a
 *                               repository's directory, or absent
 *   evaluation: present | absent
 *                               whether the evaluation folder (evals/verdict/) is here
 *   vendor: <vendor/library.txt, or (absent)>
 *   vendor-write: denied | allowed | absent
 *                               whether a write under the provisioned vendor/
 *                               succeeded
 *   residue: yes | no           whether residue.txt, which a lenient run
 *                               leaves behind, is here
 *   secret: <VERDICT_SECRET>    only when the host sets it
 *   verdict: accepted | rejected | unknown
 *                               accepted under `mode: strict`, rejected under
 *                               `mode: lenient`
 *   relaxed: gate-<n>           one line for each `gate-<n>: lenient` line the policy
 *                               holds, so a corpus of several seeded defects tells
 *                               which of its mutations a leg ran under (Story 1.45)
 *
 * When VERDICT_MARKER names a file, every run first appends one JSON line to
 * it, the launch marker (Story 1.9): `workspace`, the runtime label of the
 * workspace it runs in (`trial-clean-2` for tea-evaluate-trial-clean-2-<uuid>),
 * `head`, the commit its checkout holds (null outside git), and `request`. A
 * run that launches nothing leaves no line, and one routed to a revision
 * names that revision.
 *
 * Policy lines drive the other cases:
 *
 *   sabotage: restore       after answering, replace rules/policy.txt with a
 *                           directory, so the runtime's restore cannot write it
 *   sabotage: adopter       append a line to the file VERDICT_TOUCH names, a
 *                           path outside the workspace, as a target that
 *                           writes where it must not would
 *   sabotage: refs          tag the checked-out commit through the worktree's
 *                           repository, which the adopter's repository shares
 *   sabotage: locked        leave locked/inner behind with locked/ unreadable,
 *                           as a target that locks its own output would
 *   sabotage: link          replace rules/ with a symbolic link to the
 *                           directory VERDICT_LINK names, outside the workspace
 *   sabotage: exclude       append a line to info/exclude in the git directory
 *                           the worktree shares with the adopter's repository
 *   sabotage: swap-root     after answering, move this working directory aside
 *                           and put a symbolic link to VERDICT_LINK in its
 *                           place, as a target that swaps its own root would
 *   sabotage: leg-writes    append to VERDICT_TOUCH only when the request is
 *                           `Judge alpha.`, which a preflight leg sends and no
 *                           arm does
 *   infrastructure: exit 3  answer nothing and exit 3, an exit its registry
 *                           entry declares as infrastructure

 *   sleep: <ms>             write this process's pid to the file VERDICT_PID
 *                           names, then wait that long before answering (a
 *                           case that interrupts the run mid-arm)
 *
 * Two variables act in one workspace only, so one trial or qualification of a
 * run can differ while every other run of the command behaves: VERDICT_WHEN
 * names the workspace by its runtime label, or several labels separated by
 * commas (for example trial-clean-2, the
 * directory tea-evaluate-trial-clean-2-<uuid> that holds this working
 * directory), and VERDICT_DO says what the command does there:
 *
 *   infrastructure          answer nothing and exit 3
 *   kill                    answer nothing and end by SIGKILL, as a target a
 *                           signal stops would
 *   accept                  answer accepted whatever the policy says
 *   reject                  answer rejected whatever the policy says
 *   touch                   answer as usual, then append a line to the file
 *                           VERDICT_TOUCH names, outside the workspace
 *   bump                    answer as usual, then rewrite the package.json
 *                           VERDICT_TOUCH names so its `version` is 9.9.9, as
 *                           an installed dependency upgraded while the run
 *                           went on (Story 1.44)
 *   plant                   answer as usual, then find the newest run
 *                           directory of the adopter's evaluation folder
 *                           (through the git directory the worktree shares)
 *                           and plant trial-sets/P-001/record-1.json there as
 *                           a symbolic link to the file VERDICT_TOUCH names,
 *                           where the runtime would write a record
 *   forge                   answer as usual, then rewrite that run
 *                           directory's compiled contract, B-001's severity
 *                           lowered to low
 *   link-trials             answer as usual, then replace that run
 *                           directory's trials/clean with a symbolic link to
 *                           the adopter's rules/ directory
 *   recreate-trials         answer as usual, then replace that run
 *                           directory's trials/clean with a new, empty
 *                           directory of the same name
 *   move-trials             answer as usual, then move that run directory's
 *                           trials/ into the adopter's project as stolen/ and
 *                           leave a symbolic link to it in its place
 *   probe-confinement       answer as usual, then try to read the evaluation
 *                           folder's contract.json and to write runs/tamper.txt
 *                           (found through the git directory the worktree
 *                           shares), printing `contract-read: <how>` and
 *                           `runs-write: <how>` after the verdict, each
 *                           `allowed` or `refused <code>` (Story 1.31)
 *   probe-egress            answer as usual, then ask the egress proxy HTTPS_PROXY
 *                           names for a tunnel to each host:port VERDICT_TOUCH
 *                           lists (comma separated) and connect to each
 *                           directly, printing `egress-proxy: named` or
 *                           `none`, `egress <host:port>: <status>` and
 *                           `direct <host:port>: <how>` (Story 1.83)
 *   hold-egress             answer as usual, then wait a minute, so a case can
 *                           end the run while the call is live (Story 1.83)
 *   hold-gate               answer as usual, then write `gate-started` in the
 *                           working directory and wait (a minute at most) for a
 *                           `gate-release` file beside it, so a case can act on the
 *                           project or its repository while the run is in flight
 *                           (Story 1.112)
 *   update-ref              answer as usual, then run `git update-ref
 *                           refs/heads/written-by-target HEAD` in the working
 *                           directory, printing `update-ref: exit <code>`
 *   write-config            answer as usual, then run `git config --local
 *                           tea.written by-target`, printing `write-config: exit <code>`
 *   read-ungranted          answer as usual, then read the file VERDICT_TOUCH
 *                           names, outside the workspace, printing
 *                           `ungranted-read: <how>` after the verdict
 *   probe-git               answer as usual, then ask the worktree's git for
 *                           the committed evaluation folder and for the
 *                           project's git directory, printing one
 *                           `<name>: <how>` line per attempt after the verdict
 *                           (`printed` when git printed something, `none <exit>`
 *                           when it found nothing, `allowed` or
 *                           `refused <code>` for a file read), and the
 *                           worktree's own operations as `<name>: exit <code>`
 *                           (Story 1.57)
 *   probe-history           answer as usual, then ask the worktree's git what it
 *                           shows of the project, printing one `<name>: <how>`
 *                           line each (Story 1.80): `status` and `log` with their
 *                           exit and line count, `show-tracked`, `show-folder` and
 *                           `show-shared` (`printed` or `none <exit>`) for a tracked
 *                           file, the committed contract and a file outside the folder
 *                           that holds the contract's bytes, `tags` (the `git tag -l` names, comma
 *                           separated), `describe`, `tag-tracked` and `tag-folder`
 *                           (`<tag>=printed|none` for each tag), `remotes`, `carried`
 *                           (config lines that name a remote, URL, credential, hook
 *                           or promisor), `hooks`, `filters` (the filter driver
 *                           configuration, one `key=value` per driver key, sorted)
 *                           and `required` (`git config --type=bool` of the
 *                           `filter.upper.required` key)
 *   probe-sparse            answer as usual, then ask the worktree's git what a
 *                           sparse-checkout project shows, printing one
 *                           `<name>: <value>` line each (Story 1.85): `status`
 *                           (`git status --porcelain`), `ls-files`, `ls-files-t`
 *                           (`git ls-files -t`), `status-sparse` (the lines of the
 *                           long-form `git status` that name a sparse checkout) and
 *                           `sparse-list` (`git sparse-checkout list`), each the JSON of its
 *                           standard output (or `exit <code>` when git failed),
 *                           `sparse-config` (`core.sparseCheckout` and
 *                           `core.sparseCheckoutCone`) and `files-on-disk`
 *                           (the tracked files the checkout holds) and `worktree-config`
 *                           (whether the worktree's metadata directory holds a
 *                           `config.worktree`)
 *   probe-private           answer as usual, then look for what the run keeps
 *                           from a target, in the call the sealed-brief agent
 *                           stub makes (its request, `Judge a request of my
 *                           own.`), through the paths it announces in the file
 *                           VERDICT_TOUCH names (`--announce`, Story 1.58): read the bridge's
 *                           configuration file and token file, list the
 *                           agent's working directory, its parent and the
 *                           private root, connect to the bridge's socket, and
 *                           write its own temp directory, printing one
 *                           `private-<name>: <how>` line each (`token` when
 *                           the token file's admission token was read, never
 *                           its value); it also leaves a
 *                           process running (`verdict-private-leftover.js`)
 *                           that makes the same attempts on the directories
 *                           made after it started and reports them to the port
 *                           VERDICT_REPORT names
 *   write-temp              answer as usual, then write a file in the temp
 *                           directory TMPDIR names, printing `temp-dir: <path>`
 *                           and `temp-write: <how>` after the verdict
 *   write-home             answer as usual, then keep state the way an agent CLI
 *                           does (Story 1.59), printing `home: <HOME>`,
 *                           `xdg: <the three XDG base directories>`,
 *                           `home-before: <every file under HOME before this
 *                           call wrote>`, `parent-list` and `root-list`
 *                           (what listing the directory HOME sits in and its
 *                           parent shows), `run-homes` (the private homes
 *                           under this run's own private parent, which only a
 *                           target the confinement leaves unconfined can
 *                           list), `peer-read` (a read of the file
 *                           VERDICT_PEER names, which a case plants beside
 *                           this run's private parent), and `<name>: <how>` for each write
 *                           it makes: `home-write` and `xdg-write` (state under
 *                           HOME and under XDG_DATA_HOME), `beside-write` (the
 *                           directory HOME sits in), and `host-write` (the file
 *                           VERDICT_TOUCH names, which a case puts in the
 *                           host's real home)
 *   leftover-tamper         answer as usual, and leave a process running,
 *                           outside this process group, whose argument vector
 *                           carries VERDICT_TOUCH as a marker: once the
 *                           runtime that started this command has exited, it
 *                           rewrites the newest run's first P-001 record (its
 *                           recommendation set to FAIL) and the digest
 *                           run.json recorded for it, then exits
 *   swap-evaluator          answer as usual, and leave a process running,
 *                           marked the same way, that waits for the run's
 *                           command evaluator (evaluator/judge.sh) to start,
 *                           then moves evaluator/impl.js aside and writes a
 *                           replacement that puts it back and answers a fail
 *                           row commented `swapped bytes ran`, so the bytes
 *                           that run are not the ones the run digested and
 *                           the layer reads the same again after the trial
 *   With VERDICT_REPORT naming a port on 127.0.0.1, the process either mode
 *   leaves reports there how its attempt ended (`verdict-leftover.js`).
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { privateAnnouncements, privateAttempts } = require('./private-attempts');

const POLICY = 'rules/policy.txt';

const request = fs.readFileSync(0, 'utf8').trim();
const policy = fs.readFileSync(POLICY);
const text = policy.toString('utf8');
/** Whether this run is in the workspace VERDICT_WHEN names. */
const workspaceDirectory = path.basename(path.dirname(process.cwd()));
const workspaceMatch = /^tea-evaluate-(.+)-(?:[A-Za-z0-9]{6}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(workspaceDirectory);
const here = Boolean(process.env.VERDICT_WHEN) && process.env.VERDICT_WHEN.split(',').includes(workspaceMatch?.[1]);
const act = here ? process.env.VERDICT_DO : undefined;
if (process.env.VERDICT_MARKER) {
  const label = workspaceMatch?.[1] ?? null;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  fs.appendFileSync(
    process.env.VERDICT_MARKER,
    `${JSON.stringify({ workspace: label, head: head.status === 0 ? head.stdout.trim() : null, request })}\n`,
  );
}
if (act === 'kill') process.kill(process.pid, 'SIGKILL');
if (text.includes('infrastructure: exit 3') || act === 'infrastructure') {
  process.stderr.write('verdict: asked to report an infrastructure failure\n');
  process.exit(3);
}
const sleep = /sleep: (\d+)/.exec(text);
if (sleep !== null) {
  if (process.env.VERDICT_PID) fs.writeFileSync(process.env.VERDICT_PID, String(process.pid));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(sleep[1]));
}

let workspace = 'plain';
try {
  workspace = fs.lstatSync('.git').isDirectory() ? 'git-repository' : 'git-worktree';
} catch {
  // No .git here: a plain copy.
}

let vendor = '(absent)';
let vendorWrite = 'absent';
if (fs.existsSync('vendor')) {
  vendor = fs.readFileSync('vendor/library.txt', 'utf8').trim();
  try {
    fs.writeFileSync('vendor/probe-write.txt', 'written by the verdict stub\n');
    vendorWrite = 'allowed';
  } catch {
    vendorWrite = 'denied';
  }
}
const residue = fs.existsSync('residue.txt') ? 'yes' : 'no';

let verdict = 'unknown';
if (text.includes('mode: strict')) verdict = 'accepted';
if (text.includes(': lenient')) verdict = 'rejected';
if (act === 'accept') verdict = 'accepted';
if (act === 'reject') verdict = 'rejected';

process.stdout.write(
  [
    `request: ${request}`,
    `digest: sha256:${crypto.createHash('sha256').update(policy).digest('hex')}`,
    `workspace: ${workspace}`,
    `evaluation: ${fs.existsSync('evals/verdict') ? 'present' : 'absent'}`,
    `vendor: ${vendor}`,
    `vendor-write: ${vendorWrite}`,
    `residue: ${residue}`,
    ...(process.env.VERDICT_SECRET ? [`secret: ${process.env.VERDICT_SECRET}`] : []),
    `verdict: ${verdict}`,
    ...[...text.matchAll(/^(gate-\d+): lenient$/gm)].map((relaxed) => `relaxed: ${relaxed[1]}`),
    '',
  ].join('\n'),
);
const usageReport = here && process.env.VERDICT_USAGE_BAD !== undefined ? process.env.VERDICT_USAGE_BAD : process.env.VERDICT_USAGE;
if (usageReport !== undefined) process.stderr.write(`TEA_EVALUATE_USAGE_JSON:${usageReport}\n`);

if (verdict === 'rejected') fs.writeFileSync('residue.txt', 'left behind by a lenient run\n');
if (text.includes('sabotage: adopter') && process.env.VERDICT_TOUCH) {
  fs.appendFileSync(process.env.VERDICT_TOUCH, 'written by the verdict stub outside its workspace\n');
}
if (act === 'touch' && process.env.VERDICT_TOUCH) fs.appendFileSync(process.env.VERDICT_TOUCH, `written by the verdict stub in ${workspaceDirectory}\n`);
if (act === 'patch-lockfile' && process.env.VERDICT_TOUCH) {
  const lock = JSON.parse(fs.readFileSync(process.env.VERDICT_TOUCH, 'utf8'));
  lock.packages['node_modules/probe-fw'].resolved = 'file:patched-by-target';
  fs.writeFileSync(process.env.VERDICT_TOUCH, `${JSON.stringify(lock, null, 2)}\n`);
}
if (act === 'bump' && process.env.VERDICT_TOUCH) {
  const manifest = JSON.parse(fs.readFileSync(process.env.VERDICT_TOUCH, 'utf8'));
  fs.writeFileSync(process.env.VERDICT_TOUCH, `${JSON.stringify({ ...manifest, version: '9.9.9' }, null, 2)}\n`);
}
if (['plant', 'forge', 'link-trials', 'recreate-trials', 'move-trials'].includes(act)) {
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
  const runs = path.join(path.dirname(common), 'evals', 'verdict', 'runs');
  const newest = fs
    .readdirSync(runs)
    .filter((name) => name !== '.gitignore' && name !== '.workspace-journal')
    .sort()
    .at(-1);
  const run = path.join(runs, newest);
  if (act === 'plant' && process.env.VERDICT_TOUCH) {
    fs.mkdirSync(path.join(run, 'trial-sets', 'P-001'), { recursive: true });
    fs.symlinkSync(process.env.VERDICT_TOUCH, path.join(run, 'trial-sets', 'P-001', 'record-1.json'));
  }
  if (act === 'forge') {
    const compiled = path.join(run, 'eval-contract.json');
    const contract = JSON.parse(fs.readFileSync(compiled, 'utf8'));
    contract.behaviors[0].severity = 'low';
    fs.writeFileSync(compiled, JSON.stringify(contract));
  }
  const trials = path.join(run, 'trials');
  if (act === 'link-trials' || act === 'recreate-trials') {
    fs.rmSync(path.join(trials, 'clean'), { recursive: true, force: true });
    if (act === 'link-trials') fs.symlinkSync(path.join(path.dirname(common), 'rules'), path.join(trials, 'clean'));
    else fs.mkdirSync(path.join(trials, 'clean'));
  }
  if (act === 'move-trials') {
    const stolen = path.join(path.dirname(common), 'stolen');
    fs.renameSync(trials, stolen);
    fs.symlinkSync(stolen, trials);
  }
}
/** How an attempt on a path ended: allowed, or refused with the error code. */
const attempt = (action) => {
  try {
    action();
    return 'allowed';
  } catch (error) {
    return `refused ${error.code ?? error.message}`;
  }
};
/**
 * The adopter's evaluation folder, found through the worktree's own git directory, `<project>/.git/worktrees/<name>`:
 * a confined target's git no longer shares the project's git directory (Story 1.57), but the path of the worktree's
 * entry in it still names the project, as it names it to any target that follows the `.git` file.
 */
const evaluationFolder = () => {
  const own = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).stdout.trim();
  return path.join(path.dirname(path.dirname(path.dirname(own))), 'evals', 'verdict');
};
if (act === 'probe-confinement') {
  const folder = evaluationFolder();
  const read = attempt(() => fs.readFileSync(path.join(folder, 'contract.json')));
  const write = attempt(() => fs.writeFileSync(path.join(folder, 'runs', 'tamper.txt'), 'written by the verdict stub\n'));
  process.stdout.write(`contract-read: ${read}\nruns-write: ${write}\n`);
}
/** What the worktree's metadata names as its common directory: `../..` for a worktree of the adopter's repository. */
const commondirOf = (metadata) => {
  try {
    return fs.readFileSync(path.join(metadata, 'commondir'), 'utf8').trim();
  } catch {
    return 'unreadable';
  }
};
if (act === 'probe-git') {
  const ask = (...args) => spawnSync('git', args, { encoding: 'utf8' });
  const printed = (result) => (result.status === 0 && result.stdout.length > 0 ? 'printed' : `none ${result.status}`);
  const exit = (result) => `exit ${result.status}${result.stdout.length > 0 ? ` (${result.stdout.trim().split('\n').length} line(s))` : ''}`;
  const own = ask('rev-parse', '--absolute-git-dir').stdout.trim();
  const projectGit = path.dirname(path.dirname(own));
  const folder = 'evals/verdict';
  const lines = [
    `head-contract-show: ${printed(ask('show', `HEAD:${folder}/contract.json`))}`,
    `head-contract-cat: ${printed(ask('cat-file', '-p', `HEAD:${folder}/contract.json`))}`,
    `older-contract-show: ${printed(ask('show', `HEAD~2:${folder}/contract.json`))}`,
    `folder-tree-cat: ${printed(ask('cat-file', '-p', `HEAD:${folder}`))}`,
    `folder-tree-without-replace: ${printed(ask('--no-replace-objects', 'cat-file', '-p', `HEAD:${folder}`))}`,
    `folder-in-tree: ${ask('ls-tree', '-r', '--name-only', 'HEAD').stdout.split('\n').filter((name) => name.startsWith(`${folder}/`)).length}`,
  ];
  // Every blob id the history names for a path of the folder, read as a target that guessed one from `git log --raw` would.
  const raw = ask('log', '--raw', '--no-abbrev', '--format=').stdout.split('\n').filter((line) => line.includes(`${folder}/`));
  const blobs = [...new Set(raw.flatMap((line) => line.split(/\s+/).filter((word) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(word) && !/^0+$/.test(word))))];
  lines.push(
    `history-folder-blobs: ${blobs.length}`,
    `history-blob-read: ${blobs.some((blob) => printed(ask('cat-file', '-p', blob)) === 'printed') ? 'printed' : 'none'}`,
    `refs-beyond-replace: ${ask('for-each-ref', '--format=%(refname)').stdout.split('\n').filter((name) => name.length > 0 && !name.startsWith('refs/replace/')).length}`,
    `shared-content-show: ${printed(ask('show', 'HEAD:docs/contract-copy.json'))}`,
    `tracked-show: ${printed(ask('show', 'HEAD:rules/policy.txt'))}`,
    `status: ${exit(ask('status', '--porcelain'))}`,
    `log: ${exit(ask('log', '--oneline'))}`,
    `diff: ${exit(ask('diff', 'HEAD'))}`,
    `log-patch: ${exit(ask('log', '-p'))}`,
    `project-git-head: ${attempt(() => fs.readFileSync(path.join(projectGit, 'HEAD')))}`,
    `project-git-objects: ${attempt(() => fs.readdirSync(path.join(projectGit, 'objects')))}`,
    `project-git-config: ${attempt(() => fs.readFileSync(path.join(projectGit, 'config')))}`,
    `own-git-head: ${attempt(() => fs.readFileSync(path.join(own, 'HEAD')))}`,
    `commondir-file: ${commondirOf(own)}`,
    `git-view: ${fs.existsSync(path.join(path.dirname(ask('rev-parse', '--show-toplevel').stdout.trim()), 'git-view')) ? 'present' : 'absent'}`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}
if (act === 'probe-history') {
  const ask = (...args) => spawnSync('git', args, { encoding: 'utf8' });
  const printed = (result) => (result.status === 0 && result.stdout.length > 0 ? 'printed' : `none ${result.status}`);
  const exit = (result) => `exit ${result.status} (${result.stdout.split('\n').filter((line) => line.length > 0).length} line(s))`;
  const tags = ask('-c', 'tag.sort=refname', 'tag', '-l').stdout.split('\n').filter((name) => name.length > 0);
  const own = ask('rev-parse', '--git-common-dir').stdout.trim();
  const config = ask('config', '--list', '--local').stdout.split('\n');
  const described = ask('describe', '--tags');
  const hooks = (() => {
    try {
      return fs.readdirSync(path.join(own, 'hooks')).length;
    } catch {
      return 0;
    }
  })();
  const lines = [
    `status: ${exit(ask('status', '--porcelain'))}`,
    `log: ${exit(ask('log', '--oneline'))}`,
    `show-tracked: ${printed(ask('show', 'HEAD:rules/policy.txt'))}`,
    `show-folder: ${printed(ask('show', 'HEAD:evals/verdict/contract.json'))}`,
    `show-shared: ${printed(ask('show', 'HEAD:docs/contract-copy.json'))}`,
    `tags: ${tags.join(',')}`,
    `describe: ${described.status === 0 ? described.stdout.trim() : `none ${described.status}`}`,
    `tag-tracked: ${tags.map((tag) => `${tag}=${printed(ask('show', `${tag}:rules/policy.txt`)).split(' ')[0]}`).join(',')}`,
    `tag-folder: ${tags.map((tag) => `${tag}=${printed(ask('show', `${tag}:evals/verdict/contract.json`)).split(' ')[0]}`).join(',')}`,
    `remotes: ${ask('remote', '-v').stdout.split('\n').filter((line) => line.length > 0).length}`,
    `carried: ${config.filter((line) => /remote|url|credential|hook|promisor|partialclone/i.test(line)).length}`,
    `hooks: ${hooks}`,
    `filters: ${config.filter((line) => /^filter\./.test(line)).sort().join(' | ')}`,
    `required: ${ask('config', '--type=bool', '--get', 'filter.upper.required').stdout.trim() || 'unset'}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
if (act === 'probe-sparse') {
  const ask = (...args) => spawnSync('git', args, { encoding: 'utf8' });
  const answer = (result) => (result.status === 0 ? JSON.stringify(result.stdout) : `exit ${result.status}`);
  const configured = (key) => {
    const value = ask('config', '--get', key);
    return value.status === 0 ? value.stdout.trim() : 'unset';
  };
  const onDisk = ask('ls-files').stdout.split('\n').filter((name) => name.length > 0 && fs.existsSync(name));
  const lines = [
    `status: ${answer(ask('status', '--porcelain'))}`,
    `ls-files: ${answer(ask('ls-files'))}`,
    `ls-files-t: ${answer(ask('ls-files', '-t'))}`,
    `status-sparse: ${JSON.stringify(ask('status').stdout.split('\n').filter((line) => /sparse checkout/.test(line)).join('\n'))}`,
    `sparse-list: ${answer(ask('sparse-checkout', 'list'))}`,
    `sparse-config: ${configured('core.sparseCheckout')}/${configured('core.sparseCheckoutCone')}`,
    `files-on-disk: ${JSON.stringify(onDisk)}`,
    `worktree-config: ${fs.existsSync(path.join(ask('rev-parse', '--absolute-git-dir').stdout.trim(), 'config.worktree')) ? 'present' : 'absent'}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
if (act === 'probe-private') {
  // Only the sealed-brief agent's own call, made while the directories it announced exist; the plan's steps run before it.
  const announced = request === 'Judge a request of my own.' ? privateAnnouncements(process.env.VERDICT_TOUCH) : [];
  const latest = announced.at(-1);
  const lines = [`private-announced: ${announced.length}`];
  if (latest !== undefined) {
    lines.push(...privateAttempts(latest));
    const temp = process.env.TMPDIR ?? '';
    lines.push(`private-temp-write: ${attempt(() => fs.writeFileSync(path.join(temp, 'verdict-private.txt'), 'x\n'))}`);
    const child = spawn(process.execPath, [path.join(__dirname, 'verdict-private-leftover.js'), process.env.VERDICT_TOUCH, String(announced.length), process.env.VERDICT_REPORT ?? ''], {
      cwd: '/',
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}
if (act === 'probe-egress') {
  const proxy = process.env.HTTPS_PROXY ?? '';
  process.stdout.write(`egress-proxy: ${proxy === '' ? 'none' : 'named'}\n`);
  // Each attempt is a process of its own, as another process of the target's would be.
  const through = `
    const net = require('node:net');
    const [proxy, target] = process.argv.slice(1);
    const url = new URL(proxy);
    const socket = net.connect({ host: url.hostname, port: Number(url.port) });
    socket.on('connect', () => socket.write('CONNECT ' + target + ' HTTP/1.1\\r\\n\\r\\n'));
    socket.on('data', (chunk) => { console.log(String(chunk).split(' ')[1]); socket.destroy(); });
    socket.on('error', (error) => console.log('error ' + error.code));`;
  const directly = `
    const net = require('node:net');
    const [host, port] = process.argv[1].split(':');
    const socket = net.connect({ host, port: Number(port) });
    socket.setTimeout(3000, () => { console.log('timeout'); socket.destroy(); });
    socket.on('connect', () => { console.log('connected'); socket.destroy(); });
    socket.on('error', (error) => console.log('refused ' + error.code));`;
  for (const target of (process.env.VERDICT_TOUCH ?? '').split(',').filter(Boolean)) {
    const tunneled = proxy === '' ? 'no proxy' : spawnSync(process.execPath, ['-e', through, proxy, target], { encoding: 'utf8', timeout: 20_000 }).stdout.trim();
    process.stdout.write(`egress ${target}: ${tunneled || 'no answer'}\n`);
    const direct = spawnSync(process.execPath, ['-e', directly, target], { encoding: 'utf8', timeout: 20_000 }).stdout.trim();
    process.stdout.write(`direct ${target}: ${direct || 'no answer'}\n`);
  }
}
if (act === 'hold-egress') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
if (act === 'hold-gate') {
  // Write `gate-started` in the working directory, then wait for the case to write `gate-release` beside it (a minute at most).
  fs.writeFileSync('gate-started', '');
  for (let waited = 0; waited < 60_000 && !fs.existsSync('gate-release'); waited += 50) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
}
if (act === 'update-ref' || act === 'write-config') {
  // The git state a worktree shares with its repository: a ref, or the repository's own configuration.
  const wrote = spawnSync('git', act === 'update-ref' ? ['update-ref', 'refs/heads/written-by-target', 'HEAD'] : ['config', '--local', 'tea.written', 'by-target'], {
    encoding: 'utf8',
  });
  process.stdout.write(`${act}: exit ${wrote.status}\n`);
}
if (act === 'read-ungranted' && process.env.VERDICT_TOUCH) {
  process.stdout.write(`ungranted-read: ${attempt(() => fs.readFileSync(process.env.VERDICT_TOUCH))}\n`);
}
if (act === 'write-temp') {
  const temp = process.env.TMPDIR ?? '';
  process.stdout.write(`temp-dir: ${temp}\ntemp-write: ${attempt(() => fs.writeFileSync(path.join(temp, 'verdict-temp.txt'), 'x\n'))}\n`);
}
if (act === 'write-home') {
  const home = process.env.HOME ?? '';
  const files = (directory) =>
    fs.existsSync(directory)
      ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const full = path.join(directory, entry.name);
          return entry.isDirectory() ? files(full) : [path.relative(home, full)];
        })
      : [];
  const before = files(home).sort();
  // The private homes under this run's own private parent (`run-<runtime pid>-<random>` beneath the user's private root),
  // which only a target the confinement does not withhold it from can list. The runtime is one of this process's ancestors
  // (the command mechanism may start the target through a shell), so every ancestor's pid is tried, and `found` says whether
  // the run's parent was seen at all.
  const ownRunHomes = () => {
    const root = path.join('/tmp', `tea-evaluate-p${process.getuid()}`);
    let names;
    try {
      names = fs.readdirSync(root);
    } catch (error) {
      return `refused ${error.code}`;
    }
    const ancestors = [];
    for (let pid = process.ppid; Number.isInteger(pid) && pid > 1 && ancestors.length < 12; ) {
      ancestors.push(pid);
      pid = Number(spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim());
    }
    const parents = names.filter((name) => ancestors.some((pid) => name.startsWith(`run-${pid}-`)));
    return JSON.stringify({
      found: parents.length > 0,
      homes: parents.flatMap((parent) => fs.readdirSync(path.join(root, parent)).filter((name) => name.startsWith('tea-evaluate-target-home-'))),
    });
  };
  const list = (directory) => {
    try {
      return JSON.stringify(fs.readdirSync(directory).sort());
    } catch (error) {
      return `refused ${error.code}`;
    }
  };
  const xdg = ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'].map((name) => process.env[name] ?? '(unset)');
  const write = (file) =>
    attempt(() => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'x\n');
    });
  process.stdout.write(
    [
      `home: ${home}`,
      `xdg: ${xdg.join(' ')}`,
      `home-before: ${JSON.stringify(before)}`,
      `parent-list: ${list(path.dirname(home))}`,
      `root-list: ${list(path.dirname(path.dirname(home)))}`,
      `run-homes: ${ownRunHomes()}`,
      `peer-read: ${process.env.VERDICT_PEER ? attempt(() => fs.readFileSync(process.env.VERDICT_PEER)) : '(none)'}`,
      `home-write: ${write(path.join(home, '.verdict-state', 'session.json'))}`,
      `xdg-write: ${write(path.join(process.env.XDG_DATA_HOME ?? home, 'verdict', 'state.json'))}`,
      `beside-write: ${write(path.join(path.dirname(home), 'verdict-beside.txt'))}`,
      `host-write: ${process.env.VERDICT_TOUCH ? write(process.env.VERDICT_TOUCH) : '(no path)'}`,
      '',
    ].join('\n'),
  );
}
if ((act === 'leftover-tamper' || act === 'swap-evaluator') && process.env.VERDICT_TOUCH) {
  // The runtime's pid, found by its command line: `pgrep`, since a sandboxed process cannot start the setuid `ps` on macOS.
  const folder = evaluationFolder();
  // git names the folder by its real path, and the runtime's command line as the case spelled it (macOS's /var is /private/var).
  const spelled = folder.replace(/^\/private(?=\/)/, '').replaceAll(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
  const pattern = `evaluate\\.js run --evaluation (/private)?${spelled}`;
  // BSD pgrep leaves out its own ancestors, the runtime among them, unless asked with -a; procps pgrep reads -a otherwise.
  const found = spawnSync('pgrep', [...(process.platform === 'darwin' ? ['-a'] : []), '-f', pattern], { encoding: 'utf8' });
  const runtimes = String(found.stdout ?? '')
    .trim()
    .split(/\s+/)
    .filter((pid) => /^\d+$/.test(pid));
  const none = `none (${found.error?.code ?? found.status}: ${String(found.stderr ?? '').trim()})`;
  process.stdout.write(`leftover-runtime: ${runtimes.length > 0 ? runtimes.join(',') : none}\n`);
  const leftover = path.join(__dirname, 'verdict-leftover.js');
  const reportPort = process.env.VERDICT_REPORT ?? '';
  const child = spawn(process.execPath, [leftover, act, folder, runtimes.join(','), process.env.VERDICT_TOUCH, reportPort], {
    cwd: '/',
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
if (text.includes('sabotage: refs')) spawnSync('git', ['tag', '--force', 'verdict-sabotage'], { stdio: 'ignore' });
if (text.includes('sabotage: leg-writes') && request === 'Judge alpha.' && process.env.VERDICT_TOUCH) {
  fs.appendFileSync(process.env.VERDICT_TOUCH, 'written by a preflight leg outside its workspace\n');
}
if (text.includes('sabotage: exclude')) {
  const common = spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
  if (common.length > 0) fs.appendFileSync(`${common}/info/exclude`, 'written-by-the-verdict-stub\n');
}
if (text.includes('sabotage: link') && process.env.VERDICT_LINK) {
  fs.rmSync('rules', { recursive: true, force: true });
  fs.symlinkSync(process.env.VERDICT_LINK, 'rules');
}
if (text.includes('sabotage: locked')) {
  fs.mkdirSync('locked/inner', { recursive: true });
  fs.chmodSync('locked', 0o000);
}
if (text.includes('sabotage: swap-root') && process.env.VERDICT_LINK) {
  const here = process.cwd();
  process.chdir('..');
  fs.renameSync(here, `${here}.moved`);
  fs.symlinkSync(process.env.VERDICT_LINK, here);
}
if (text.includes('sabotage: restore')) {
  fs.rmSync(POLICY);
  fs.mkdirSync(POLICY);
}
