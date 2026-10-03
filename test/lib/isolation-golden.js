/**
 * What each isolation module generates for fixed inputs: the Seatbelt profiles
 * and the Bubblewrap argument vectors of `cli/lib/isolate.js`,
 * `cli/lib/atdd-isolation.js` and `cli/lib/evaluate/confinement.js` (Story 1.62).
 *
 * `collectGeneratedOutputs()` is read by `test/test-isolation-primitives.js`,
 * which holds the result byte-identical to `test/fixtures/isolation-primitives/golden.json`.
 * The golden was captured from the modules as they were before the shared
 * primitive module existed; a story that changes a profile on purpose
 * regenerates it with `TEA_UPDATE_ISOLATION_GOLDEN=1 npm run test:isolation-primitives`
 * and reads the diff.
 *
 * Two host facts would make the output differ between machines, so the case
 * stands in for them: the link map `fs.realpathSync` resolves paths through
 * (`/tmp` and `/var` are links on macOS) and whether `/run/user` exists
 * (Bubblewrap hides it when it does).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isolate = require('../../cli/lib/isolate');
const atdd = require('../../cli/lib/atdd-isolation');
const confinement = require('../../cli/lib/evaluate/confinement');

/** The links the case pretends the host has, as macOS has them. */
function linked(candidate) {
  if (candidate === '/tmp') return '/private/tmp';
  if (candidate.startsWith('/var/')) return `/private${candidate}`;
  return candidate;
}

/** Runs `body` with the host facts above fixed, and restores the real ones. */
function withFixedHost(body) {
  const realpathSync = fs.realpathSync;
  const existsSync = fs.existsSync;
  const stub = (candidate) => linked(String(candidate));
  stub.native = stub;
  fs.realpathSync = stub;
  fs.existsSync = (candidate) => (candidate === '/run/user' ? true : existsSync(candidate));
  try {
    return body();
  } finally {
    fs.realpathSync = realpathSync;
    fs.existsSync = existsSync;
  }
}

/**
 * @returns {Record<string, unknown>} every generated profile and vector, keyed by what generated it
 */
function collectGeneratedOutputs() {
  return withFixedHost(() => {
    const statusDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-golden-'));
    try {
      const evaluationFolder = '/proj/evaluations/demo';
      const workspace = '/var/folders/ab/cd/T/tea-workspace';
      const privateDirectory = '/var/folders/ab/cd/T/tea-private';
      const seatbeltConfinement = { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder };
      const bubblewrapConfinement = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder };
      const seatbeltTarget = confinement.targetSandbox({ confinement: seatbeltConfinement, workspace });
      const bubblewrapTarget = confinement.targetSandbox({
        confinement: bubblewrapConfinement,
        workspace,
        status: statusDirectory,
      });
      const bubblewrapWrapped = bubblewrapTarget.wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]);
      // A workspace in a git repository also withholds the project's git directory, the worktree's own entry in it excepted (Story 1.57).
      const git = { directory: '/proj/.git', metadata: '/proj/.git/worktrees/tea-workspace' };
      const seatbeltGitTarget = confinement.targetSandbox({ confinement: seatbeltConfinement, workspace, git });
      const bubblewrapGitTarget = confinement.targetSandbox({
        confinement: bubblewrapConfinement,
        workspace,
        git,
        status: statusDirectory,
      });
      const bubblewrapGitWrapped = bubblewrapGitTarget.wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]);
      const alternates = ['/proj/shared/objects'];
      const bubblewrapAlternatesWrapped = confinement
        .targetSandbox({
          confinement: bubblewrapConfinement,
          workspace,
          git: { ...git, alternates },
          status: statusDirectory,
        })
        .wrap('/fixture/bin/node', ['target.js'], []);
      const bubblewrapCopyGitWrapped = confinement
        .targetSandbox({
          confinement: bubblewrapConfinement,
          workspace,
          git: { directory: git.directory, metadata: null },
          status: statusDirectory,
        })
        .wrap('/fixture/bin/node', ['target.js'], []);
      // The user's private root directory is withheld from every target, a git workspace's included (Story 1.58).
      const privateRoot = '/var/folders/ab/cd/T/tea-evaluate-p501';
      const seatbeltPrivateTarget = confinement.targetSandbox({ confinement: seatbeltConfinement, workspace, git, privateRoot });
      const bubblewrapPrivateWrapped = confinement
        .targetSandbox({ confinement: bubblewrapConfinement, workspace, git, privateRoot, status: statusDirectory })
        .wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]);
      // Every confined trial's private home is granted like the call's temp directory (Story 1.59).
      const home = '/var/folders/ab/cd/T/tea-evaluate-target-home-AbCdEf';
      const seatbeltHomeTarget = confinement.targetSandbox({ confinement: seatbeltConfinement, workspace, git, privateRoot, home });
      const bubblewrapHomeWrapped = confinement
        .targetSandbox({ confinement: bubblewrapConfinement, workspace, git, privateRoot, home, status: statusDirectory })
        .wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]);
      // A home beneath the user's private root, the run's own parent holding it, is the one directory of the root a target reaches.
      const rootHome = `${privateRoot}/run-501-AbCdEf/tea-evaluate-target-home-AbCdEf`;
      const seatbeltRootHomeTarget = confinement.targetSandbox({
        confinement: seatbeltConfinement,
        workspace,
        git,
        privateRoot,
        home: rootHome,
      });
      const bubblewrapRootHomeWrapped = confinement
        .targetSandbox({ confinement: bubblewrapConfinement, workspace, git, privateRoot, home: rootHome, status: statusDirectory })
        .wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]);
      // An audited Bubblewrap sandbox runs the command under strace, outside the namespace (Story 1.60).
      const bubblewrapAuditWrapped = confinement
        .targetSandbox({
          confinement: { ...bubblewrapConfinement, observer: { executable: '/usr/bin/strace' } },
          workspace,
          git,
          privateRoot,
          home: rootHome,
          audit: { directory: `${privateRoot}/run-501-AbCdEf/tea-evaluate-audit-AbCdEf` },
          status: statusDirectory,
        })
        .wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory], ['/opt/toolchain']);
      // Story 1.54 keeps the source status directory under the recoverable private parent. Its file is mounted at
      // a synthetic /dev path, so neither the root nor the target home's parent gains a visible status sibling.
      const ownedRoot = path.join(statusDirectory, 'owned-root');
      const ownedParent = path.join(ownedRoot, 'run-501-AbCdEf');
      const ownedHome = path.join(ownedParent, 'tea-evaluate-target-home-AbCdEf');
      const ownedStatus = path.join(ownedParent, 'tea-evaluate-status-AbCdEf');
      fs.mkdirSync(ownedHome, { recursive: true });
      fs.mkdirSync(ownedStatus);
      const bubblewrapOwnedStatusWrapped = confinement
        .targetSandbox({
          confinement: { ...bubblewrapConfinement, observer: { executable: '/usr/bin/strace' } },
          workspace,
          git,
          privateRoot: ownedRoot,
          home: ownedHome,
          audit: { directory: path.join(ownedParent, 'tea-evaluate-audit-AbCdEf') },
          status: ownedStatus,
        })
        .wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory], ['/opt/toolchain']);
      // A started HTTP server's call carries the bridge's socket, in a directory the call may write (Story 1.63).
      const bridgeDirectory = '/var/folders/ab/cd/T/tea-evaluate-netbridge-AbCdEf';
      const bubblewrapBridgeWrapped = confinement
        .targetSandbox({ confinement: bubblewrapConfinement, workspace, git, privateRoot, home: rootHome, status: statusDirectory })
        .wrap('/fixture/bin/node', ['server.js'], [privateDirectory, bridgeDirectory], [], { bridge: `${bridgeDirectory}/bridge.sock` });
      // An entry that declares `network: host` keeps the host's network: the same command with no network namespace (Story 1.63).
      const bubblewrapHostWrapped = confinement
        .targetSandbox({ confinement: bubblewrapConfinement, workspace, git, privateRoot, home: rootHome, status: statusDirectory })
        .wrap('/fixture/bin/node', ['agent.js'], [privateDirectory], [], { network: 'host' });
      const outputs = {
        'isolate.buildSandboxProfile': isolate.buildSandboxProfile(
          ['/proj/out/test-review.md', '/proj/out/verdict.json'],
          '/var/folders/ab/cd/T',
        ),
        'isolate.buildSandboxProfile.tmpOnly': isolate.buildSandboxProfile([], '/tmp'),
        'isolate.buildBwrapPrefix': isolate.buildBwrapPrefix('/proj', '/tmp/tea-writable'),
        'atdd.buildSeatbeltProfile': atdd.buildSeatbeltProfile({ workspace }),
        'atdd.sandboxedCommand.seatbelt': atdd.sandboxedCommand({
          backend: 'seatbelt',
          profilePath: '/var/folders/ab/cd/T/probe.sb',
          cpuSeconds: 60,
          command: '/fixture/bin/node',
          args: ['check.js', '--flag'],
        }),
        'atdd.sandboxedCommand.bubblewrap': atdd.sandboxedCommand({
          backend: 'bubblewrap',
          workspace,
          cpuSeconds: 60,
          command: '/fixture/bin/node',
          args: ['check.js', '--flag'],
        }),
        'atdd.sandboxedCommand.bubblewrap.allowHostLoopback': atdd.sandboxedCommand({
          backend: 'bubblewrap',
          workspace,
          cpuSeconds: 30,
          command: '/fixture/bin/node',
          args: ['check.js'],
          allowHostLoopback: true,
          env: { PATH: '/usr/bin:/bin', HOME: workspace },
        }),
        'confinement.layerPrefix.seatbelt': confinement.layerPrefix(seatbeltConfinement),
        'confinement.layerPrefix.bubblewrap': confinement.layerPrefix(bubblewrapConfinement),
        'confinement.targetSandbox.wrap.seatbelt': seatbeltTarget.wrap('/fixture/bin/node', ['target.js', '--flag'], [privateDirectory]),
        'confinement.targetSandbox.wrap.bubblewrap': { ...bubblewrapWrapped },
        'confinement.targetSandbox.wrap.seatbelt.git': seatbeltGitTarget.wrap(
          '/fixture/bin/node',
          ['target.js', '--flag'],
          [privateDirectory],
        ),
        'confinement.targetSandbox.wrap.seatbelt.gitCopy': confinement
          .targetSandbox({ confinement: seatbeltConfinement, workspace, git: { directory: git.directory, metadata: null } })
          .wrap('/fixture/bin/node', ['target.js'], []),
        'confinement.targetSandbox.wrap.bubblewrap.git': { ...bubblewrapGitWrapped },
        'confinement.targetSandbox.wrap.bubblewrap.gitCopy': { ...bubblewrapCopyGitWrapped },
        'confinement.targetSandbox.wrap.seatbelt.gitAlternates': confinement
          .targetSandbox({ confinement: seatbeltConfinement, workspace, git: { ...git, alternates } })
          .wrap('/fixture/bin/node', ['target.js'], []),
        'confinement.targetSandbox.wrap.bubblewrap.gitAlternates': { ...bubblewrapAlternatesWrapped },
        'confinement.targetSandbox.wrap.seatbelt.privateRoot': seatbeltPrivateTarget.wrap(
          '/fixture/bin/node',
          ['target.js', '--flag'],
          [privateDirectory],
        ),
        'confinement.targetSandbox.wrap.bubblewrap.privateRoot': { ...bubblewrapPrivateWrapped },
        'confinement.targetSandbox.wrap.seatbelt.home': seatbeltHomeTarget.wrap(
          '/fixture/bin/node',
          ['target.js', '--flag'],
          [privateDirectory],
        ),
        'confinement.targetSandbox.wrap.bubblewrap.home': { ...bubblewrapHomeWrapped },
        'confinement.targetSandbox.wrap.seatbelt.rootHome': seatbeltRootHomeTarget.wrap(
          '/fixture/bin/node',
          ['target.js', '--flag'],
          [privateDirectory],
        ),
        'confinement.targetSandbox.wrap.bubblewrap.rootHome': { ...bubblewrapRootHomeWrapped },
        // The audit (Story 1.60): Seatbelt's profile reports what it allows outside the grants and tags its refusals with the
        // sandbox's token (a fixed one here, since the sandbox draws its own at random), and Bubblewrap's command runs under strace.
        'confinement.seatbeltTargetProfile.audit': confinement.seatbeltTargetProfile({
          workspace,
          writable: [privateDirectory],
          evaluationFolder,
          git: { ...git, alternates: [] },
          privateRoot,
          rootHome,
          audit: {
            token: 'tea-evaluate-audit-0123456789abcdef',
            exempt: [workspace, privateDirectory, '/usr/lib/node', rootHome],
            quiet: [git.metadata, '/var/folders/ab/cd/T/tea-workspace-view'],
          },
        }),
        'confinement.targetSandbox.wrap.bubblewrap.audit': { ...bubblewrapAuditWrapped },
        'confinement.targetSandbox.wrap.bubblewrap.audit.ownedStatus': { ...bubblewrapOwnedStatusWrapped },
        'confinement.targetSandbox.wrap.bubblewrap.bridge': { ...bubblewrapBridgeWrapped },
        'confinement.targetSandbox.wrap.bubblewrap.host': { ...bubblewrapHostWrapped },
      };
      // The Node installation the runtime runs from is a read grant of every call, and the host's own.
      const nodeInstallation = confinement.nodeInstallRoot(process.execPath);
      for (const key of [
        'confinement.targetSandbox.wrap.bubblewrap.audit',
        'confinement.targetSandbox.wrap.bubblewrap.audit.ownedStatus',
      ]) {
        const granted = [...outputs[key].trace.grants.read];
        // It is listed before the system's own directories, which can include it (a node at /usr/bin/node).
        granted[granted.indexOf(nodeInstallation)] = '<node-installation>';
        outputs[key].trace.grants.read = granted;
      }
      // The Bubblewrap status file's name carries a random token, its directory is made fresh and the node binary is the host's,
      // so each is named by role.
      const text = JSON.stringify(outputs)
        .split(linked(statusDirectory))
        .join('<status>')
        .split(statusDirectory)
        .join('<status>')
        .split(process.execPath)
        .join('<node>')
        .replaceAll(/status-(\d+)-[0-9a-f]{16}\.json/g, 'status-$1-<token>.json')
        .replaceAll(/trace-(\d+)-[0-9a-f]{12}\.txt/g, 'trace-$1-<token>.txt')
        .replaceAll(path.join(__dirname, '..', '..', 'cli', 'lib', 'evaluate'), '<confinement-directory>');
      const normalized = JSON.parse(text);
      // A path the host resolves through a link is granted under both spellings (`/var` and `/private/var` on macOS) and under one where
      // it is no link, so the grants of the audited call are compared as sets.
      for (const key of [
        'confinement.targetSandbox.wrap.bubblewrap.audit',
        'confinement.targetSandbox.wrap.bubblewrap.audit.ownedStatus',
      ]) {
        const audited = normalized[key].trace.grants;
        for (const name of ['read', 'write']) audited[name] = [...new Set(audited[name])];
      }
      return normalized;
    } finally {
      fs.rmSync(statusDirectory, { recursive: true, force: true });
    }
  });
}

module.exports = { collectGeneratedOutputs };
