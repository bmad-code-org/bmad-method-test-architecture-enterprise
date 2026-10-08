/**
 * The smallest GitHub REST client the review CLI needs: one request function with bounded retry,
 * and the pull request lookups built on it. Used by the base-ref resolution (`--pr`).
 */

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_LIMIT = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a transient failure only. A 403 on a missing permission will not fix itself, but a
 * secondary rate limit also answers 403, and that one will: the body is the only thing that
 * tells them apart.
 */
function isRetryableStatus(status, body = '') {
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  return status === 403 && /secondary rate limit/i.test(String(body));
}

/** Milliseconds GitHub asked to wait (Retry-After as seconds or an HTTP-date, capped at 60 s), else a linear backoff. */
function retryAfterMs(headers, attempt) {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  const seconds = Number(raw);
  if (raw !== null && String(raw).trim() !== '' && Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 60) * 1000;
  const until = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(until) && until > Date.now()) return Math.min(until - Date.now(), 60_000);
  return 1000 * attempt;
}

/** The status travels on the error, because callers branch on it (a 403 from a classic PAT is not a 500). */
function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function githubRequest({ apiUrl, token, method, path: apiPath, body }) {
  const endpoint = `${String(apiUrl || 'https://api.github.com').replace(/\/+$/, '')}${apiPath}`;
  for (let attempt = 1; ; attempt += 1) {
    let res;
    try {
      res = await fetch(endpoint, {
        method,
        headers: {
          authorization: `bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/vnd.github+json',
          'user-agent': 'bmad-method-test-architecture-enterprise/tea-test-review',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt > RETRY_LIMIT) throw apiError(`network error contacting the GitHub API: ${error.message}`);
      await sleep(1000 * attempt);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (isRetryableStatus(res.status, text) && attempt <= RETRY_LIMIT) {
        await sleep(retryAfterMs(res.headers, attempt));
        continue;
      }
      throw apiError(`GitHub API returned ${res.status}: ${text.slice(0, 300)}`, res.status);
    }

    return res.json().catch(() => null);
  }
}

/** `owner/repo` from a --repo value or GITHUB_REPOSITORY, else null. */
function parseRepository(value) {
  const [owner, repo, ...rest] = String(value || '').split('/');
  return owner && repo && rest.length === 0 ? { owner, repo } : null;
}

/** The token the environment carries. */
function tokenFromEnv(env = process.env) {
  return String(env.GITHUB_TOKEN || '').trim();
}

/** The pull request, fetched at most once per `cache`. */
async function fetchPullRequest({ token, apiUrl, cache }, repo, prNumber) {
  const key = `${repo.owner}/${repo.repo}#${prNumber}`;
  if (cache && cache.has(key)) return cache.get(key);
  const pr = await githubRequest({ apiUrl, token, method: 'GET', path: `/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}` });
  // A 200 that does not parse yields null; caching it would hand the next caller a failure it could have recovered from.
  if (cache && pr) cache.set(key, pr);
  return pr;
}

/**
 * The git ref a pull request merges into, as `origin/<branch>`.
 *
 * Guessing origin/main when the base is unknown would diff against the wrong commit and review
 * test files the pull request never touched, so every failure here throws with the bypass named.
 *
 * @throws {Error} With code BASE_LOOKUP_FAILED.
 */
async function resolvePrBaseRef({ prNumber, repo, token, apiUrl, cache }) {
  const guidance = 'Pass --base <ref> to bypass the lookup.';
  const fail = (message) => Object.assign(new Error(`${message} ${guidance}`), { code: 'BASE_LOOKUP_FAILED' });
  if (!repo) {
    throw fail(`cannot resolve the base branch of #${prNumber}: no repository (set GITHUB_REPOSITORY or pass --repo owner/name).`);
  }
  if (!token) {
    throw fail(`cannot resolve the base branch of #${prNumber}: no GITHUB_TOKEN in the environment.`);
  }
  let pr;
  try {
    pr = await fetchPullRequest({ token, apiUrl, cache }, repo, prNumber);
  } catch (error) {
    throw fail(`cannot resolve the base branch of #${prNumber} from the GitHub API: ${error.message}.`);
  }
  const base = pr && pr.base && typeof pr.base.ref === 'string' ? pr.base.ref.trim() : '';
  if (base === '') {
    throw fail(`the GitHub API returned no base ref for #${prNumber}.`);
  }
  return `origin/${base}`;
}

module.exports = {
  githubRequest,
  fetchPullRequest,
  resolvePrBaseRef,
  parseRepository,
  tokenFromEnv,
  isRetryableStatus,
  retryAfterMs,
  sleep,
};
