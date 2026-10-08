#!/usr/bin/env bash
# Install the latest actionlint release into a directory, surviving a GitHub outage.
#
# Usage: bash tools/install-actionlint.sh <directory>
#
# quality.yaml's chain job and publish.yaml's job both run this, so the retry and the
# checks live once and test/test-install-actionlint.js runs the same shell the workflows run.
#
# The steps:
# 1. Fetch the download script pinned by commit and check its sha256.
#    "main" is mutable, so the script is pinned by commit and checksummed.
# 2. Resolve the latest release tag from the redirect of /releases/latest.
#    The pinned script's own `latest` keyword downloads its built-in version, so the version floats here.
# 3. Run the pinned script for that version with a curl in front of PATH.
#    The curl passes every call to the real curl except the release tarball.
#    The tarball is downloaded with retries, checked with `gzip -t` and against the release's checksum file,
#    and written to the pinned script's `tar` only when it passed.
#    A page from an outage never reaches `tar`.
#
# Every download retries up to ATTEMPTS times with a wait that doubles (2, 4, 8, 16, 32, 64 seconds), which rides out a GitHub outage of about two minutes.
# The waits of one run share a budget of WAIT_BUDGET seconds (126, the sum of the schedule), which keeps a pull request's step short.
# A run that has spent DEADLINE seconds stops retrying, so a hung network ends in a message that names the cause before the step's 5 minute timeout.
# The worst case stays inside that timeout: the last wait starts before the deadline (170 seconds) and lasts at most 64,
# and the attempt after it makes at most two requests of 20 seconds (the tarball and the checksum file), about 274 seconds in all.

set -euo pipefail

SCRIPT_COMMIT=3795ba2f6cb243eeca54c9d22e5c531cb9dcfb4a
SCRIPT_SHA256_DEFAULT=a96d60132afb74536ff2b55cc784d5c55b0b57980d3d49f962f0b3871447d53a
ATTEMPTS=7
WAIT_BUDGET=126
DEADLINE=${INSTALL_ACTIONLINT_DEADLINE:-170}

# The integration test points these at a stub server; the defaults are the pinned GitHub values.
RAW_BASE=${INSTALL_ACTIONLINT_RAW_BASE:-https://raw.githubusercontent.com/rhysd/actionlint}
RELEASES_BASE=${INSTALL_ACTIONLINT_RELEASES_BASE:-https://github.com/rhysd/actionlint/releases}
SCRIPT_SHA256=${INSTALL_ACTIONLINT_SCRIPT_SHA256:-$SCRIPT_SHA256_DEFAULT}
RETRY_BASE=${INSTALL_ACTIONLINT_RETRY_BASE:-2}
SLEEP=${INSTALL_ACTIONLINT_SLEEP:-sleep}

SCRIPT_URL="${RAW_BASE}/${SCRIPT_COMMIT}/scripts/download-actionlint.bash"
LATEST_URL="${RELEASES_BASE}/latest"
CURL_LIMITS=(--connect-timeout 10 --max-time 20)

# What the last failed attempt saw, for the final message.
FAIL_STATUS=000
FAIL_DETAIL=
FAIL_NOTE=
ATTEMPTS_MADE=0

log() { printf 'install-actionlint: %s\n' "$*" >&2; }

# fail MESSAGE: print it and exit.
# A failure inside the curl in front of PATH is also written to a file, so the installer can end on it after the pinned script reports its own error.
fail() {
  log "$*"
  if [[ -n ${INSTALL_ACTIONLINT_FAILURE:-} ]]; then printf '%s\n' "$*" >"$INSTALL_ACTIONLINT_FAILURE"; fi
  exit 1
}

# give_up WHAT: the final message after the last attempt failed.
give_up() {
  local plural=s
  if ((ATTEMPTS_MADE == 1)); then plural=; fi
  fail "$1 failed after ${ATTEMPTS_MADE} attempt${plural}; last HTTP status ${FAIL_STATUS}${FAIL_DETAIL:+ (${FAIL_DETAIL})}; ${FAIL_NOTE}"
}

# wait_before_retry ATTEMPT: sleep RETRY_BASE * 2^(ATTEMPT-1) seconds, within what is left of the budget.
wait_before_retry() {
  local planned waited pause
  planned=$((RETRY_BASE << ($1 - 1)))
  waited=$(cat "$INSTALL_ACTIONLINT_WORK/waited" 2>/dev/null || echo 0)
  pause=$planned
  if ((pause > WAIT_BUDGET - waited)); then pause=$((WAIT_BUDGET - waited)); fi
  if ((pause > 0)); then
    echo $((waited + pause)) >"$INSTALL_ACTIONLINT_WORK/waited"
    "$SLEEP" "$pause"
  fi
}

# with_retry FUNCTION: run FUNCTION until it succeeds, ATTEMPTS runs out or the run's DEADLINE passes.
# FUNCTION sets FAIL_STATUS, FAIL_DETAIL and FAIL_NOTE when it fails.
with_retry() {
  local attempt=1
  while true; do
    FAIL_STATUS=000
    FAIL_DETAIL=
    FAIL_NOTE=
    if "$1"; then return 0; fi
    ATTEMPTS_MADE=$attempt
    if ((attempt >= ATTEMPTS)); then return 1; fi
    if (($(date +%s) - $(cat "$INSTALL_ACTIONLINT_WORK/started") >= DEADLINE)); then return 1; fi
    log "attempt ${attempt} of ${ATTEMPTS} failed (HTTP ${FAIL_STATUS}${FAIL_DETAIL:+, ${FAIL_DETAIL}}; ${FAIL_NOTE}); retrying"
    wait_before_retry "$attempt"
    attempt=$((attempt + 1))
  done
}

# fetch_file URL FILE: one GET that follows redirects.
# It returns 0 on a 2xx answer.
# A curl error counts as status 000 with its message as the detail.
fetch_file() {
  local status code=0
  rm -f "$2"
  status=$("$INSTALL_ACTIONLINT_REAL_CURL" -sSL "${CURL_LIMITS[@]}" -o "$2" -w '%{http_code}' "$1" 2>"$INSTALL_ACTIONLINT_WORK/curl.err") || code=$?
  if ((code != 0)); then
    FAIL_STATUS=000
    FAIL_DETAIL="curl exit ${code}: $(tr '\n' ' ' <"$INSTALL_ACTIONLINT_WORK/curl.err" | sed 's/ *$//')"
    return 1
  fi
  FAIL_STATUS=$status
  case $status in
    2??) return 0 ;;
  esac
  return 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# describe_body FILE: say whether the body is a gzip file, for the final message.
describe_body() {
  local magic
  magic=$(head -c 2 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n') || true
  if [[ $magic != 1f8b ]]; then
    echo "the body was not a gzip file"
  elif gzip -t "$1" 2>/dev/null; then
    echo "the body was a gzip file"
  else
    echo "the body was a truncated or corrupt gzip file"
  fi
}

# Step 1: the pinned download script.
try_script() {
  local actual
  if ! fetch_file "$SCRIPT_URL" "$INSTALL_ACTIONLINT_WORK/download-actionlint.bash"; then
    FAIL_NOTE="the script was not downloaded"
    return 1
  fi
  actual=$(sha256_of "$INSTALL_ACTIONLINT_WORK/download-actionlint.bash")
  if [[ $actual != "$SCRIPT_SHA256" ]]; then
    FAIL_NOTE="the sha256 mismatch: the download is ${actual} and the pinned script is ${SCRIPT_SHA256}"
    return 1
  fi
}

# Step 2: the latest release tag, from the redirect of /releases/latest.
try_latest() {
  local answer code=0 location
  answer=$("$INSTALL_ACTIONLINT_REAL_CURL" -sS "${CURL_LIMITS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$LATEST_URL" 2>"$INSTALL_ACTIONLINT_WORK/curl.err") || code=$?
  if ((code != 0)); then
    FAIL_DETAIL="curl exit ${code}: $(tr '\n' ' ' <"$INSTALL_ACTIONLINT_WORK/curl.err" | sed 's/ *$//')"
    FAIL_NOTE="no release tag was resolved"
    return 1
  fi
  FAIL_STATUS=${answer%% *}
  location=${answer#* }
  if [[ $location =~ /releases/tag/v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    VERSION=${BASH_REMATCH[1]}
    return 0
  fi
  FAIL_NOTE="the answer named no release tag (Location: ${location:-none})"
  return 1
}

# The release tarball, inside the curl in front of PATH.
try_checksums() {
  local file=$INSTALL_ACTIONLINT_WORK/checksums.txt
  if fetch_file "$CHECKSUMS_URL" "$file"; then
    if grep -Eq '^[0-9a-f]{64}  ' "$file"; then
      CHECKSUMS=present
      return 0
    fi
    FAIL_NOTE="the checksum file held no sha256 line"
    return 1
  fi
  if [[ $FAIL_STATUS == 404 ]]; then
    # The release publishes no checksum file.
    # This is the one case where the check is skipped.
    CHECKSUMS=absent
    return 0
  fi
  FAIL_NOTE="the checksum file was not downloaded"
  return 1
}

# verify_checksum TARBALL: the sha256 of the tarball against its line in the release's checksum file.
verify_checksum() {
  local expected actual
  if [[ -z $CHECKSUMS ]]; then
    with_retry try_checksums || give_up "downloading ${CHECKSUMS_URL}"
  fi
  if [[ $CHECKSUMS == absent ]]; then return 0; fi
  expected=$(awk -v name="$FILE" '$2 == name || $2 == "*" name { print $1; exit }' "$INSTALL_ACTIONLINT_WORK/checksums.txt")
  if [[ -z $expected ]]; then fail "the checksum file ${CHECKSUMS_URL} has no line for ${FILE}"; fi
  actual=$(sha256_of "$1")
  if [[ $actual != "$expected" ]]; then
    FAIL_NOTE="the body was a gzip file whose sha256 ${actual} differs from the checksum file's ${expected}"
    return 1
  fi
}

try_tarball() {
  local tarball=$INSTALL_ACTIONLINT_WORK/tarball.gz
  if fetch_file "$TARBALL_URL" "$tarball" && gzip -t "$tarball" 2>/dev/null; then
    verify_checksum "$tarball" && return 0
    return 1
  fi
  FAIL_NOTE=$(describe_body "$tarball")
  return 1
}

# curl_shim ARGS...: stand in for curl inside the pinned script.
curl_shim() {
  local arg url=
  for arg in "$@"; do
    case $arg in
      */releases/download/v*/actionlint_*.tar.gz) url=$arg ;;
    esac
  done
  if [[ -z $url ]]; then exec "$INSTALL_ACTIONLINT_REAL_CURL" "$@"; fi
  TARBALL_URL=$url
  FILE=${url##*/}
  local release=${url%/*}
  CHECKSUMS_URL="${release}/actionlint_${release##*/v}_checksums.txt"
  CHECKSUMS=
  with_retry try_tarball || give_up "downloading ${TARBALL_URL}"
  cat "$INSTALL_ACTIONLINT_WORK/tarball.gz"
}

main() {
  local dir=${1:-} rc=0 tool
  if [[ -z $dir ]]; then fail "usage: bash tools/install-actionlint.sh <directory>"; fi
  for tool in curl gzip tar awk od head sed tr date mktemp; do
    command -v "$tool" >/dev/null 2>&1 || fail "${tool} is required and was not found on PATH"
  done
  if [[ ! $RETRY_BASE =~ ^[0-9]+$ ]]; then fail "INSTALL_ACTIONLINT_RETRY_BASE must be a whole number of seconds"; fi
  mkdir -p "$dir"
  dir=$(cd "$dir" && pwd)

  INSTALL_ACTIONLINT_WORK=$(mktemp -d)
  trap 'rm -rf "$INSTALL_ACTIONLINT_WORK"' EXIT
  INSTALL_ACTIONLINT_REAL_CURL=$(command -v curl)
  INSTALL_ACTIONLINT_FAILURE=$INSTALL_ACTIONLINT_WORK/failure
  date +%s >"$INSTALL_ACTIONLINT_WORK/started"
  INSTALL_ACTIONLINT_RETRY_BASE=$RETRY_BASE
  INSTALL_ACTIONLINT_SLEEP=$SLEEP
  INSTALL_ACTIONLINT_DEADLINE=$DEADLINE
  export INSTALL_ACTIONLINT_WORK INSTALL_ACTIONLINT_REAL_CURL INSTALL_ACTIONLINT_FAILURE INSTALL_ACTIONLINT_RETRY_BASE INSTALL_ACTIONLINT_SLEEP INSTALL_ACTIONLINT_DEADLINE

  with_retry try_script || give_up "fetching the pinned download script ${SCRIPT_URL}"
  VERSION=
  with_retry try_latest || give_up "resolving the latest release from ${LATEST_URL}"
  log "installing actionlint ${VERSION} to ${dir}"

  mkdir "$INSTALL_ACTIONLINT_WORK/shim"
  printf '#!/usr/bin/env bash\nexec bash %q --curl-shim "$@"\n' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")" \
    >"$INSTALL_ACTIONLINT_WORK/shim/curl"
  chmod +x "$INSTALL_ACTIONLINT_WORK/shim/curl"
  PATH="$INSTALL_ACTIONLINT_WORK/shim:$PATH" bash "$INSTALL_ACTIONLINT_WORK/download-actionlint.bash" "$VERSION" "$dir" || rc=$?
  if ((rc != 0)); then
    if [[ -s $INSTALL_ACTIONLINT_FAILURE ]]; then
      fail "the pinned download script exited ${rc}: $(cat "$INSTALL_ACTIONLINT_FAILURE")"
    fi
    fail "the pinned download script exited ${rc}"
  fi
  if [[ ! -x $dir/actionlint ]]; then fail "the pinned download script ended without ${dir}/actionlint"; fi
}

if [[ ${1:-} == --curl-shim ]]; then
  shift
  curl_shim "$@"
else
  main "$@"
fi
