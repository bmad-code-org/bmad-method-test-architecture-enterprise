'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * The directories of this host's `git` outside the system's own (Story 1.60): the confinement audits every process of a target,
 * a `git` the fixture's target runs included, and a toolchain outside `/usr` is read from where it is installed, as an adopter
 * declares it in `systemPaths` (a Homebrew prefix on macOS or the selected Command Line Tools or Xcode installation).
 * Resolve Darwin's shim before confinement so its framework and cache dependencies remain outside the target's grants.
 * Nothing on a host whose git lives under `/usr`, as CI's does.
 */
function gitToolchain(env) {
  const found = spawnSync('which', ['git'], { encoding: 'utf8', env }).stdout.trim();
  const paths = new Set();
  let bin = null;
  let executable = found;
  if (found !== '') {
    let real = fs.realpathSync(found);
    if (process.platform === 'darwin' && real.startsWith('/usr/bin/')) {
      const selected = spawnSync('xcrun', ['--find', 'git'], { encoding: 'utf8', env });
      if (selected.status !== 0 || !fs.existsSync(selected.stdout.trim())) throw new Error('cannot resolve selected Darwin git');
      real = fs.realpathSync(selected.stdout.trim());
      bin = path.dirname(real);
      executable = real;
    }
    const cellar = real.indexOf('/Cellar/');
    if (cellar !== -1) paths.add(real.slice(0, cellar));
    else if (!real.startsWith('/usr/') && !real.startsWith('/bin/')) paths.add(path.dirname(path.dirname(real)));
  }
  return {
    executable,
    paths: [...paths].filter((entry) => fs.existsSync(entry)),
    env: bin === null ? {} : { PATH: [bin, env.PATH].join(path.delimiter) },
  };
}

module.exports = { gitToolchain };
