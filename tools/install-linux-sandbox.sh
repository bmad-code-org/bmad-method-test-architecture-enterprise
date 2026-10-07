#!/usr/bin/env bash
# Install bubblewrap and strace on a runner, surviving a stalled mirror or a held dpkg lock.
#
# Usage: bash tools/install-linux-sandbox.sh
#
# quality.yaml, publish.yaml and failing-pack-loop.yaml run this, so the retry and the bounds live once.
# bubblewrap is the Linux isolation backend of tea-atdd-red-check and tea-evaluate; strace is the observer of tea-evaluate's audit,
# and the same commands exit 12 without them.
#
# The workflows restore DEB_CACHE (~/.cache/tea-linux-sandbox-debs) with actions/cache, keyed by the runner image, before this runs.
# A restored cache installs from its packages with no update and no download, so a stalled mirror cannot reach a shard at all; a
# miss, or cached packages that do not install, takes the mirror path below and leaves its downloads in DEB_CACHE for the cache to save.
# DEB_CACHE sits in the runner user's home, which apt's `_apt` download user cannot enter, so that one install downloads as root
# (APT::Sandbox::User=root), as apt would anyway after warning that it could not.
#
# The install used to be one `apt-get update && apt-get install` with no bound, so a mirror that accepted a connection and went
# silent held a shard for the job's whole 20 minutes. Now:
#  - each try is wrapped in `timeout` (TRY_SECONDS, 180), so a stall ends the try and not the job;
#  - apt retries a failed download (Acquire::Retries), gives up on a silent connection (Acquire::http::Timeout and
#    Acquire::https::Timeout, 30 seconds) and waits for a held dpkg lock (DPkg::Lock::Timeout, 120 seconds);
#  - `update` and `install` keep their output, so the log names the source or the package download that stalls;
#  - a try that fails drops the runner's preferred mirror (the first line of MIRROR_LIST, the hosted runner's
#    /etc/apt/apt-mirrors.txt) while another mirror remains, so the next try asks the next mirror and not the one that stalled
#    (a stalled azure.archive.ubuntu.com once timed out all three tries of a shard in the .deb downloads after a good update);
#  - three tries, then a `::error` line naming the step and a non-zero exit.
# The workflow step carries its own `timeout-minutes` above the worst case of the three tries (about 9 minutes with the waits).

set -uo pipefail

TRIES="${TRIES:-3}"
MIRROR_LIST="${MIRROR_LIST:-/etc/apt/apt-mirrors.txt}"
TRY_SECONDS="${TRY_SECONDS:-180}"
DEB_CACHE="${DEB_CACHE:-${HOME}/.cache/tea-linux-sandbox-debs}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"
STEP='Install bubblewrap and strace'

APT_OPTIONS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=120)

# shellcheck disable=SC2329 # run through `bash -c` with its body passed by `declare -f`
install_once() {
  sudo apt-get "${APT_OPTIONS[@]}" update &&
    sudo apt-get "${APT_OPTIONS[@]}" -o "Dir::Cache::Archives=${DEB_CACHE}" -o APT::Sandbox::User=root install -y -q --no-install-recommends bubblewrap strace
}

# Both commands answer on PATH: an install that exits 0 and leaves either missing is no install.
installed() {
  command -v bwrap > /dev/null && command -v strace > /dev/null
}

# Leaves DEB_CACHE as packages the runner user owns, with apt's partial downloads and lock gone, so actions/cache can save it.
tidy_cache() {
  sudo rm -rf "${DEB_CACHE}/partial" "${DEB_CACHE}/lock"
  sudo chown -R "$(id -u):$(id -g)" "${DEB_CACHE}"
}

# A restored cache: its packages install with no update and no download, or the mirror path runs.
cached=("${DEB_CACHE}"/*.deb)
if [ -e "${cached[0]}" ]; then
  echo "${STEP}: installing ${#cached[@]} package(s) from the package cache, with no download"
  status=0
  timeout --kill-after=10 "${TRY_SECONDS}" sudo apt-get "${APT_OPTIONS[@]}" install -y -q --no-install-recommends --no-download "${cached[@]}" || status=$?
  if [ "${status}" = 0 ] && installed; then
    echo "${STEP}: installed from the package cache"
    tidy_cache
    exit 0
  fi
  echo "${STEP}: the cached packages did not install (status ${status}); installing from the mirrors"
fi
mkdir -p "${DEB_CACHE}/partial"

# Drops the first mirror of MIRROR_LIST while another remains, naming both. A host with no mirror list, or one mirror, is left as it is.
drop_preferred_mirror() {
  [ -f "${MIRROR_LIST}" ] || return 0
  local mirrors
  mirrors="$(grep -c . "${MIRROR_LIST}")"
  if [ "${mirrors}" -lt 2 ]; then return 0; fi
  echo "${STEP}: dropping the mirror $(grep -m1 . "${MIRROR_LIST}" | cut -f1) for the next try; next is $(grep . "${MIRROR_LIST}" | sed -n 2p | cut -f1)"
  local kept
  kept="$(mktemp)"
  awk 'NF && !dropped { dropped = 1; next } { print }' "${MIRROR_LIST}" > "${kept}" && sudo cp "${kept}" "${MIRROR_LIST}"
  rm -f "${kept}"
}

for ((try = 1; try <= TRIES; try += 1)); do
  echo "${STEP}: try ${try} of ${TRIES}, at most ${TRY_SECONDS} seconds"
  # `timeout` runs a function through a shell of its own, so the function's body is passed as a command.
  status=0
  timeout --kill-after=10 "${TRY_SECONDS}" bash -c "$(declare -p APT_OPTIONS DEB_CACHE); $(declare -f install_once); install_once" || status=$?
  if [ "${status}" = 0 ] && installed; then
    echo "${STEP}: installed on try ${try}"
    tidy_cache
    exit 0
  fi
  if [ "${status}" = 0 ]; then status='0, and bwrap or strace is not on PATH'; fi
  echo "${STEP}: try ${try} ended with status ${status}$([ "${status}" = 124 ] && echo ' (timed out)')"
  if ((try < TRIES)); then
    drop_preferred_mirror
    sleep "${WAIT_SECONDS}"
  fi
done

echo "::error title=${STEP}::apt-get could not install bubblewrap and strace in ${TRIES} tries of ${TRY_SECONDS} seconds; the source named in the log above is stalled or unreachable"
exit 1
