#!/usr/bin/env bash
# Install bubblewrap and strace on a runner, surviving a stalled mirror or a held dpkg lock.
#
# Usage: bash tools/install-linux-sandbox.sh
#
# quality.yaml, publish.yaml and failing-pack-loop.yaml run this, so the retry and the bounds live once.
# bubblewrap is the Linux isolation backend of tea-atdd-red-check and tea-evaluate; strace is the observer of tea-evaluate's audit,
# and the same commands exit 12 without them.
#
# The install used to be one `apt-get update && apt-get install` with no bound, so a mirror that accepted a connection and went
# silent held a shard for the job's whole 20 minutes. Now:
#  - each try is wrapped in `timeout` (TRY_SECONDS, 180), so a stall ends the try and not the job;
#  - apt retries a failed download (Acquire::Retries), gives up on a silent connection (Acquire::http::Timeout and
#    Acquire::https::Timeout, 30 seconds) and waits for a held dpkg lock (DPkg::Lock::Timeout, 120 seconds);
#  - `update` keeps its output, so the log names the source that stalls;
#  - three tries, then a `::error` line naming the step and a non-zero exit.
# The workflow step carries its own `timeout-minutes` above the worst case of the three tries (about 9 minutes with the waits).

set -uo pipefail

TRIES="${TRIES:-3}"
TRY_SECONDS="${TRY_SECONDS:-180}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"
STEP='Install bubblewrap and strace'

APT_OPTIONS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=120)

# shellcheck disable=SC2329 # run through `bash -c` with its body passed by `declare -f`
install_once() {
  sudo apt-get "${APT_OPTIONS[@]}" update && sudo apt-get "${APT_OPTIONS[@]}" install -y -qq bubblewrap strace
}

for ((try = 1; try <= TRIES; try += 1)); do
  echo "${STEP}: try ${try} of ${TRIES}, at most ${TRY_SECONDS} seconds"
  # `timeout` runs a function through a shell of its own, so the function's body is passed as a command.
  status=0
  timeout --kill-after=10 "${TRY_SECONDS}" bash -c "$(declare -p APT_OPTIONS); $(declare -f install_once); install_once" || status=$?
  if [ "${status}" = 0 ]; then
    echo "${STEP}: installed on try ${try}"
    exit 0
  fi
  echo "${STEP}: try ${try} ended with status ${status}$([ "${status}" = 124 ] && echo ' (timed out)')"
  if ((try < TRIES)); then sleep "${WAIT_SECONDS}"; fi
done

echo "::error title=${STEP}::apt-get could not install bubblewrap and strace in ${TRIES} tries of ${TRY_SECONDS} seconds; the source named in the log above is stalled or unreachable"
exit 1
