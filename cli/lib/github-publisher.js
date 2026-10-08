/**
 * The opt-in GitHub surfaces of a review: a check run opened before the review starts and closed
 * with the verdict, and one pull-request comment upserted on a hidden marker.
 *
 * A GitHub repository whose CI is Jenkins or Buildkite gets the same surfaces as the GitHub
 * Action through `--github`. Everything here is cosmetic to the verdict, which is the process exit
 * code, so no function throws: a failure is a warning and the review's outcome stands.
 */

const fs = require('node:fs');

const { githubRequest, fetchPullRequest, parseRepository, tokenFromEnv } = require('./github-api');
const { LEGACY_COMMENT_MARKER, buildCommentMarker, renderCheck, renderComment } = require('./render');

// The Checks API documents 65535 for output.summary and enforces it in bytes.
// output.title has no documented cap, so 255 is a conservative unknown.
const MAX_CHECK_RUN_SUMMARY_BYTES = 65_535;
const MAX_CHECK_RUN_TITLE_BYTES = 255;
const DEFAULT_CHECK_NAME = 'TEA Test Review';
const COMMENT_PAGES = 10;

/** Pull request number from the event payload, falling back to refs/pull/N/merge. */
function resolvePrNumber(payload, env = process.env) {
  const fromPayload = payload?.pull_request?.number ?? payload?.issue?.number;
  if (Number.isInteger(fromPayload)) return fromPayload;
  const match = /^refs\/pull\/(\d+)\//.exec(String(env.GITHUB_REF || ''));
  return match ? Number(match[1]) : null;
}

function readEventPayload(env = process.env) {
  try {
    return env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : null;
  } catch {
    return null;
  }
}

/** The URL of this CI run, from a flag or the GitHub Actions environment. */
function workflowRunUrl(env = process.env) {
  const server = String(env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  return env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
}

/**
 * The comment this CLI owns, found by its hidden marker.
 *
 * An exact agent-tagged match always wins, checked across every comment before any legacy
 * fallback is considered, so a stale untagged comment earlier in the list can never shadow the
 * agent's own current comment.
 *
 * Only the default agent adopts an untagged legacy marker left over from before comments were
 * agent-tagged. If every agent could adopt one, two agents racing on the same PR (dual review,
 * matrix jobs) could both GET the same legacy comment before either PATCH lands and one would
 * silently overwrite the other's review.
 */
function findOwnComment(comments, agent = 'claude', { botOnly = false } = {}) {
  // With botOnly (a GitHub Actions run, where the comment is written by github-actions[bot]) a
  // comment a person wrote cannot be ours, so nobody can capture the comment by typing the marker.
  const list = (comments || []).filter(
    (comment) => comment && typeof comment.body === 'string' && !(botOnly && comment.user?.type && comment.user.type !== 'Bot'),
  );
  // The marker is the first line of the comment this CLI writes. A comment that merely contains it
  // (a quote, a reply, text a drive-by commenter typed) is not ours, and among several candidates
  // the one a bot account wrote wins over one a person wrote. The author is not checked beyond
  // that preference: an installation token cannot ask GitHub who it is.
  const owned = (marker) => {
    const candidates = list.filter((comment) => comment.body.trimStart().startsWith(marker));
    return candidates.find((comment) => comment.user?.type === 'Bot') ?? candidates[0] ?? null;
  };
  const exact = owned(buildCommentMarker(agent));
  if (exact) return exact;
  if (agent !== 'claude') return null;
  return owned(LEGACY_COMMENT_MARKER);
}

/** Create the comment, or update the one this CLI already owns on the pull request. */
async function upsertComment(ctx, prNumber, body, agent = 'claude', options = {}) {
  const comments = [];
  for (let page = 1; page <= COMMENT_PAGES; page += 1) {
    const batch = await githubRequest({
      ...ctx,
      method: 'GET',
      path: `/repos/${ctx.owner}/${ctx.repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
  }

  const existing = findOwnComment(comments, agent, options);
  if (existing) {
    await githubRequest({
      ...ctx,
      method: 'PATCH',
      path: `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${existing.id}`,
      body: { body },
    });
    return 'Updated';
  }
  await githubRequest({ ...ctx, method: 'POST', path: `/repos/${ctx.owner}/${ctx.repo}/issues/${prNumber}/comments`, body: { body } });
  return 'Created';
}

/**
 * The pull request's head SHA, which is the only commit its Checks list renders against.
 * GITHUB_SHA is no substitute: on an issue_comment run it is the default branch's tip, and on a
 * pull_request run it is the merge commit. Neither is a commit in the pull request, so a check run
 * keyed to either one is created successfully and then shows up nowhere.
 */
async function resolveHeadSha({ headSha, payload, token, apiUrl, cache }, repo, prNumber) {
  if (typeof headSha === 'string' && headSha.trim() !== '') return headSha.trim();
  const fromPayload = payload?.pull_request?.head?.sha;
  if (typeof fromPayload === 'string' && fromPayload !== '') return fromPayload;
  const pr = await fetchPullRequest({ token, apiUrl, cache }, repo, prNumber);
  const sha = pr?.head?.sha;
  return typeof sha === 'string' && sha !== '' ? sha : null;
}

async function findOpenCheckRun(ctx, headSha, name, agent) {
  const found = await githubRequest({
    ...ctx,
    method: 'GET',
    path: `/repos/${ctx.owner}/${ctx.repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(name)}&per_page=100`,
  });
  const runs = Array.isArray(found?.check_runs) ? found.check_runs : [];
  // A run another agent opened under the same name is that agent's live review, not a leftover of
  // this one: adopting it would let whichever job finishes last decide the check.
  const ours = (run) => !agent || !run.output?.summary || run.output.summary.includes(`running on ${agent}.`);
  const open = runs.find((run) => run && run.status !== 'completed' && Number.isInteger(run.id) && ours(run));
  return open ? open.id : null;
}

/**
 * Trim to a byte budget, because the API's limit is bytes and one multi-byte character counts for
 * several. Cuts on a character boundary so the result is never invalid UTF-8.
 */
function clampBytes(text, maxBytes) {
  const value = String(text ?? '');
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const suffix = '\n\n_(truncated)_';
  const budget = maxBytes - Buffer.byteLength(suffix, 'utf8');
  let cut = value;
  while (Buffer.byteLength(cut, 'utf8') > budget) {
    cut = cut.slice(0, Math.max(0, cut.length - Math.ceil((Buffer.byteLength(cut, 'utf8') - budget) / 4) - 1));
  }
  // The cut counted code units, so it can end between the halves of a surrogate pair.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return cut + suffix;
}

/** `output` within the API's documented limits. */
function checkRunOutput(title, summary) {
  return { title: clampBytes(title, MAX_CHECK_RUN_TITLE_BYTES), summary: clampBytes(summary, MAX_CHECK_RUN_SUMMARY_BYTES) };
}

/** Where a warning goes: stderr, because stdout carries the verdict JSON. */
function defaultWarn(message, env = process.env) {
  console.error(env.GITHUB_ACTIONS ? `::warning::tea-test-review: ${message}` : `tea-test-review WARNING: ${message}`);
}

/**
 * What a `--github` run needs to talk to GitHub, from flags first and the standard GITHUB_*
 * variables after. `missing` names why the run cannot publish, or is null.
 */
function resolveTarget(options = {}, env = process.env) {
  const payload = readEventPayload(env);
  const repo = parseRepository(options.repo ?? env.GITHUB_REPOSITORY);
  const prNumber = Number.isInteger(options.prNumber) ? options.prNumber : resolvePrNumber(payload, env);
  const token = tokenFromEnv(env);
  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  let missing = null;
  if (!token) missing = 'GITHUB_TOKEN is empty';
  else if (!repo) missing = 'there is no repository (set GITHUB_REPOSITORY or pass --repo owner/name)';
  return {
    repo,
    prNumber,
    token,
    apiUrl,
    payload,
    missing,
    runUrl: options.runUrl || workflowRunUrl(env),
    botOnly: env.GITHUB_ACTIONS === 'true',
  };
}

/**
 * The publisher for one review. `begin` opens the check run before the review starts; `finish`
 * closes it with the verdict and upserts the comment. Neither throws.
 *
 * @param {object} config
 * @param {object} config.target - From resolveTarget.
 * @param {string} config.agent - Adapter name; tags the comment marker.
 * @param {string} [config.checkName]
 * @param {boolean} [config.comment=true]
 * @param {boolean} [config.checkRun=true]
 * @param {string} [config.headSha]
 * @param {string} [config.artifactName]
 * @param {Map} [config.cache] - Shares the pull request fetch with the base-ref lookup.
 * @param {(message: string) => void} [config.warn]
 * @param {(message: string) => void} [config.log]
 */
function createPublisher(config) {
  const {
    target,
    agent = 'claude',
    checkName = DEFAULT_CHECK_NAME,
    comment = true,
    checkRun = true,
    headSha,
    artifactName,
    cache,
  } = config;
  const warn = config.warn ?? defaultWarn;
  const log = config.log ?? ((message) => console.error(`tea-test-review: ${message}`));
  const enabled = target.missing === null;
  const ctx = enabled ? { owner: target.repo.owner, repo: target.repo.repo, token: target.token, apiUrl: target.apiUrl } : null;
  let checkRunId = null;
  let resolvedHeadSha = null;

  if (!enabled) {
    warn(`--github is set but ${target.missing}, so nothing was published. The review still runs.`);
  } else if (target.prNumber == null) {
    log('No pull request in context, so there is nothing to publish.');
  }
  const active = enabled && target.prNumber != null;

  async function createCheckRun(sha) {
    try {
      // POST always creates, so a re-run would stack a second run under the same name and let
      // whichever finishes last decide the gate. Worse, a run that was killed outright left one
      // pinned at in_progress, which a required check has no UI to clear. Adopting the open one
      // fixes both.
      const open = await findOpenCheckRun(ctx, sha, checkName, agent).catch(() => null);
      if (open != null) {
        log(`Reusing the check run left open on ${sha.slice(0, 7)} by an earlier attempt.`);
        return open;
      }
      const created = await githubRequest({
        ...ctx,
        method: 'POST',
        path: `/repos/${ctx.owner}/${ctx.repo}/check-runs`,
        body: {
          name: checkName,
          head_sha: sha,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          ...(target.runUrl ? { details_url: target.runUrl } : {}),
          // The agent lives here rather than in the name, which branch protection matches on and
          // which must therefore not move when a mention switches vendors.
          output: checkRunOutput(
            'Review in progress',
            `The TEA test review is running on ${agent}.${target.runUrl ? ` [Live log](${target.runUrl})` : ''}`,
          ),
        },
      });
      return Number.isInteger(created?.id) ? created.id : null;
    } catch (error) {
      warn(
        `Could not create the check run: ${error.message}. The review still runs; this is cosmetic. ` +
          'Grant the job `checks: write`, and use the default GITHUB_TOKEN: the Checks API rejects a classic personal access token. ' +
          'Pass --no-check-run to stop trying.',
      );
      return null;
    }
  }

  async function completeCheckRun({ conclusion, title, summary }) {
    const id = checkRunId;
    checkRunId = null;
    if (id == null) return;
    const path = `/repos/${ctx.owner}/${ctx.repo}/check-runs/${id}`;
    try {
      await githubRequest({
        ...ctx,
        method: 'PATCH',
        path,
        body: { status: 'completed', conclusion, completed_at: new Date().toISOString(), output: checkRunOutput(title, summary) },
      });
    } catch (error) {
      // A check left at in_progress under a required name blocks the merge with no UI to clear
      // it, so one retry drops `output` (the only part of the body that can be rejected for its
      // size or content) and closes the run bare.
      try {
        await githubRequest({
          ...ctx,
          method: 'PATCH',
          path,
          body: { status: 'completed', conclusion, completed_at: new Date().toISOString() },
        });
        warn(`Could not write the check run's summary: ${error.message}. It was closed as ${conclusion} without one.`);
      } catch (retryError) {
        warn(
          `Could not complete the check run: ${retryError.message}. It stays in progress on the pull request, and a later run on the same ` +
            "commit adopts it. The verdict is unaffected; it is this process's exit code.",
        );
      }
    }
  }

  return {
    get checkRunId() {
      return checkRunId;
    },

    /** The pull request head the surfaces are attached to, once begin() has resolved it. */
    get headSha() {
      return resolvedHeadSha;
    },

    /** Open the check run. Resolves to nothing; a failure is a warning. */
    async begin() {
      if (!active) return;
      let sha = null;
      try {
        sha = await resolveHeadSha(
          { headSha, payload: target.payload, token: target.token, apiUrl: target.apiUrl, cache },
          target.repo,
          target.prNumber,
        );
      } catch (error) {
        if (checkRun)
          warn(`Could not resolve the head SHA of #${target.prNumber}: ${error.message}. The review still runs without a check run.`);
      }
      resolvedHeadSha = sha;
      if (!checkRun) return;
      if (!sha) {
        warn(`Could not resolve the head SHA of #${target.prNumber}, so the review runs without a check run. Pass --head-sha.`);
        return;
      }
      checkRunId = await createCheckRun(sha);
    },

    /**
     * Close the check run and upsert the comment, from the final outcome.
     *
     * @param {object} outcome
     * @param {number} outcome.exitCode
     * @param {object|null} outcome.verdict
     * @param {string} [outcome.cause] - Why a run with no verdict ended.
     * @param {string} [outcome.focus]
     * @param {object} [outcome.extra] - More render context: reportPath, reportMissing.
     */
    async finish({ exitCode, verdict, cause, focus, extra }) {
      const context = {
        ...extra,
        agent,
        runUrl: target.runUrl,
        artifactName,
        exitCode,
        cause,
        focus,
        headSha: resolvedHeadSha ?? extra?.headSha,
      };
      if (active && comment) {
        try {
          const note = await upsertComment(ctx, target.prNumber, renderComment(verdict, context), agent, { botOnly: target.botOnly });
          log(`${note} the review comment on #${target.prNumber}.`);
        } catch (error) {
          warn(
            `Could not publish the review comment: ${error.message}. The verdict is unaffected; it is this process's exit code. ` +
              'Check that the job grants pull-requests: write.',
          );
        }
      }
      if (checkRunId != null) await completeCheckRun(renderCheck(verdict, context));
    },
  };
}

module.exports = {
  DEFAULT_CHECK_NAME,
  MAX_CHECK_RUN_SUMMARY_BYTES,
  MAX_CHECK_RUN_TITLE_BYTES,
  checkRunOutput,
  clampBytes,
  createPublisher,
  defaultWarn,
  findOpenCheckRun,
  findOwnComment,
  readEventPayload,
  resolveHeadSha,
  resolvePrNumber,
  resolveTarget,
  upsertComment,
  workflowRunUrl,
};
