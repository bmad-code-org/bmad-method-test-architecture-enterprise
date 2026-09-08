'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { version: TEA_CLI_VERSION } = require('../../package.json');

const REVIEW_PROVENANCE_KEYS = {
  teaCliVersion: 'string',
  skillRubricVersion: null,
  modelIdentifier: null,
  baseSha: null,
  headSha: null,
  triggerComment: null,
  workflowRun: null,
  gateMode: 'string',
  sources: 'object',
};

function gitSha(projectRoot, ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return result.error || result.status !== 0 ? null : result.stdout.trim() || null;
}

function skillRubricVersion(skillRoot) {
  try {
    const template = fs.readFileSync(path.join(skillRoot, 'test-review-template.md'), 'utf8');
    return /^\*\*Workflow\*\*:\s*testarch-test-review\s+v([^\s]+)\s*$/m.exec(template)?.[1] ?? null;
  } catch {
    return null;
  }
}

function triggerCommentFromEnvironment(env) {
  if (!env.GITHUB_EVENT_PATH) return null;
  try {
    const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    return event.comment?.html_url ?? (event.comment?.id == null ? null : String(event.comment.id));
  } catch {
    return null;
  }
}

function workflowRunFromEnvironment(env) {
  if (!env.GITHUB_RUN_ID) return null;
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  return String(env.GITHUB_RUN_ID);
}

/**
 * Build reproducibility metadata from values the CLI can prove.
 *
 * Missing values stay null. The sources map tells artifact consumers where
 * each value came from, or why this process could not know it.
 */
function buildReviewProvenance({ projectRoot, skillRoot, baseRef, filesProvided, modelIdentifier, gateMode = 'all', env = process.env }) {
  const rubricVersion = skillRubricVersion(skillRoot);
  const baseSha = filesProvided ? null : gitSha(projectRoot, baseRef);
  const headSha = gitSha(projectRoot, 'HEAD');
  const triggerComment = triggerCommentFromEnvironment(env);
  const workflowRun = workflowRunFromEnvironment(env);

  const provenance = {
    teaCliVersion: TEA_CLI_VERSION,
    skillRubricVersion: rubricVersion,
    modelIdentifier: modelIdentifier ?? null,
    baseSha,
    headSha,
    triggerComment,
    workflowRun,
    gateMode,
    sources: {
      teaCliVersion: 'package.json',
      skillRubricVersion: rubricVersion
        ? 'test-review-template.md Workflow metadata'
        : 'unavailable: skill template has no readable Workflow version',
      modelIdentifier:
        modelIdentifier == null ? 'unavailable: selected adapter does not expose a model identifier' : 'resolved agent adapter model',
      baseSha: filesProvided
        ? 'unavailable: --files bypassed the git comparison base'
        : baseSha
          ? `git rev-parse ${baseRef}^{commit}`
          : `unavailable: git could not resolve ${baseRef}`,
      headSha: headSha ? 'git rev-parse HEAD^{commit}' : 'unavailable: project root is not a readable git worktree',
      triggerComment: triggerComment
        ? 'GitHub event comment URL or id'
        : 'unavailable: run was not triggered by a readable GitHub comment event',
      workflowRun: workflowRun ? 'GitHub Actions environment' : 'unavailable: GITHUB_RUN_ID is not set',
      gateMode: '--gate-on effective value',
    },
  };
  const keys = Object.keys(provenance);
  if (keys.length !== Object.keys(REVIEW_PROVENANCE_KEYS).length || keys.some((key) => !Object.hasOwn(REVIEW_PROVENANCE_KEYS, key))) {
    throw new Error(`review-provenance: keys ${JSON.stringify(keys)} disagree with REVIEW_PROVENANCE_KEYS`);
  }
  return provenance;
}

module.exports = { TEA_CLI_VERSION, REVIEW_PROVENANCE_KEYS, buildReviewProvenance, gitSha, skillRubricVersion };
