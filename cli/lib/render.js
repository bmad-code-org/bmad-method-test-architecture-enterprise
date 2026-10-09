/**
 * The review's human surfaces, rendered from the verdict JSON alone.
 *
 * One pure function of the verdict plus a few facts the caller knows (the agent, the run URL, the
 * artifact name, the exit code, the requester's focus). The CLI, the GitHub publisher and any other
 * CI read the same text, so the PR comment, the check run and a job summary can never disagree.
 *
 * What the comment leads with is the gate verdict and the reviewed head SHA. It lists only the
 * findings that affect that verdict, at most three, each with its own title. It never inlines the
 * report, and it names the report artifact only when the caller states one, because the comment is
 * often written before the upload step that would create it.
 *
 * It renders whatever fields the verdict carries: a field an older or newer CLI does not write is
 * simply absent from the text.
 */

const LEGACY_COMMENT_MARKER = '<!-- tea-test-review -->';
const MAX_LISTED_FINDINGS = 3;
const MAX_LISTED_GATE_FAILURES = 3;
const MAX_CAUSE_CHARS = 400;
const MAX_FOCUS_CHARS = 600;
const MAX_FOCUS_LINES = 8;
const MAX_LISTED_DRY_RUN_FILES = 10;
// GitHub rejects a comment body over 65,536 characters; this leaves room for what the cut adds.
const MAX_COMMENT_CHARS = 60_000;
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const PASSING_RECOMMENDATIONS = new Set(['Approve', 'Approve with Comments']);

const EXIT_MEANING = {
  0: 'review passed, was skipped, or a verdict failure was waived',
  1: 'review verdict failure',
  2: 'environment or configuration error, the gate did not run',
  3: 'agent or report-parse failure',
};

/**
 * The hidden marker that identifies the comment this CLI owns, tagged by agent so two agents
 * reviewing one pull request keep one comment each.
 */
function buildCommentMarker(agent = 'claude') {
  // The tag is part of a hidden marker another run searches for, so it keeps to a safe alphabet.
  const tag = String(agent || 'claude')
    .trim()
    .replaceAll(/[^\w.-]/g, '_');
  return `<!-- tea-test-review:${tag || 'claude'} -->`;
}

function exitMeaning(exitCode) {
  return EXIT_MEANING[exitCode] ?? `unexpected exit code ${exitCode}`;
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

function shortSha(sha) {
  return isNonEmptyString(sha) ? sha.trim().slice(0, 8) : null;
}

function plural(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function fileList(value) {
  return (Array.isArray(value) ? value : []).filter((file) => isNonEmptyString(file));
}

/** Cut to `limit` UTF-16 units without leaving half of a surrogate pair behind. */
function cut(text, limit) {
  if (text.length <= limit) return text;
  const end = /[\uD800-\uDBFF]/.test(text[limit - 1]) ? limit - 1 : limit;
  return text.slice(0, end);
}

/**
 * Text that came from an agent, a file path, a requester or a verdict file, made safe to place in
 * a comment: it can no longer carry an HTML comment (and so another run's hidden marker) or ping
 * a person or team with an @mention.
 */
function plain(text) {
  return String(text ?? '')
    .replaceAll('<!--', '< !--')
    .replaceAll('-->', '-- >')
    .replaceAll(/@(?!\u200B)/g, '@\u200B');
}

function bounded(text, limit) {
  const flat = String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return plain(flat.length > limit ? `${cut(flat, limit)}...` : flat);
}

/** A code span that cannot be closed early by a backtick inside the text. */
function code(text) {
  return `\`${plain(text).replaceAll('`', "'")}\``;
}

function severityRank(severity) {
  const text = String(severity ?? '').toLowerCase();
  const index = SEVERITY_ORDER.findIndex((name) => text.includes(name));
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function severityLabel(severity) {
  const text = String(severity ?? '').trim();
  if (text === '') return 'Finding';
  // "P0 (Critical)" style labels reduce to the name the summary counts use.
  const named = SEVERITY_ORDER.find((name) => text.toLowerCase().includes(name));
  return named ? named[0].toUpperCase() + named.slice(1) : bounded(text, 40);
}

function findingLocation(finding) {
  const file = isNonEmptyString(finding.path) ? finding.path : finding.file;
  if (!isNonEmptyString(file)) return 'location unavailable';
  return Number.isInteger(finding.line) ? `${file}:${finding.line}` : file;
}

/**
 * The findings that affect the gate, most severe first, each kept as its own record. Keying them
 * by registry row would collapse two findings under one row into the last one's title.
 */
function gatingFindings(verdict) {
  const findings = Array.isArray(verdict.findings) ? verdict.findings : [];
  return findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding && typeof finding === 'object' && finding.verdict_impact === true)
    .sort((a, b) => severityRank(a.finding.severity) - severityRank(b.finding.severity) || a.index - b.index)
    .map(({ finding }) => finding);
}

function countsLine(counts) {
  const part = (name) => `${Number.isInteger(counts?.[name]) ? counts[name] : 0} ${name[0].toUpperCase()}${name.slice(1)}`;
  return SEVERITY_ORDER.map(part).join(' / ');
}

/** Whether a parsed JSON value has the shape of a verdict or skip payload this CLI writes. */
function looksLikeVerdict(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.promptOnly === true || value.skipped === true) return true;
  return typeof value.recommendation === 'string' && typeof value.gatingViolations === 'object' && value.gatingViolations !== null;
}

/**
 * Why an exit code and a verdict cannot both be true of one run, or null. A caller that renders a
 * run from its verdict file and its exit code gets text that contradicts itself when they come
 * from different runs, so the pair is refused instead of rendered.
 */
function contradiction(verdict, exitCode) {
  if (exitCode === undefined || exitCode === null) return null;
  if (!looksLikeVerdict(verdict)) {
    return exitCode === 0 || exitCode === 1
      ? `exit code ${exitCode} says the run produced a verdict, and the verdict file is missing or is not one`
      : null;
  }
  if (verdict.promptOnly === true) return exitCode === 0 ? null : `a dry run (--agent none) exits 0, not ${exitCode}`;
  if (verdict.skipped === true) return null;
  const failing = Array.isArray(verdict.gateFailures) && verdict.gateFailures.length > 0 && verdict.waived !== true;
  if (exitCode === 0 && failing)
    return 'exit code 0 says the gate passed, and the verdict carries unwaived gate failures (they are from different runs)';
  if (exitCode === 1 && !failing)
    return 'exit code 1 says the gate failed, and the verdict carries no gate failure (they are from different runs)';
  return null;
}

/**
 * Decide which state the run is in. The exit code, when the caller has it, is the authority on
 * whether the gate failed, because it folds in every threshold flag and waiver; without it the
 * verdict's own gateFailures and waiver fields say the same thing.
 */
function classify(verdict, exitCode) {
  const hasVerdict = verdict && typeof verdict === 'object' && !Array.isArray(verdict);
  if (exitCode === 2 || exitCode === 3 || !hasVerdict) {
    return { state: 'broken', gateFailed: true };
  }
  if (verdict.promptOnly === true) return { state: 'dry-run', gateFailed: false };
  if (verdict.skipped === true) {
    // A deletions-only skip fails the gate unless it is waived; a --fail-on-skip skip leaves no
    // trace in the payload, so only the exit code can say so.
    const deletionsOnly = Array.isArray(verdict.deletedFiles) && verdict.deletedFiles.length > 0;
    const inferred = deletionsOnly && verdict.waived !== true;
    return { state: 'skipped', gateFailed: exitCode === undefined || exitCode === null ? inferred : exitCode === 1 };
  }
  const failures = Array.isArray(verdict.gateFailures) ? verdict.gateFailures : [];
  const failedByVerdict = failures.length > 0 && verdict.waived !== true;
  const gateFailed = exitCode === undefined || exitCode === null ? failedByVerdict : exitCode !== 0;
  if (verdict.waived === true && !gateFailed) return { state: 'waived', gateFailed: false };
  return { state: gateFailed ? 'fail' : 'pass', gateFailed };
}

function scopeSentence(verdict, files, sha) {
  const at = sha ? ` at ${code(sha)}` : '';
  const mode = verdict.reviewMode;
  if (mode === 'full-file') return `Full-file review of ${plural(files.length, 'test file')}${at}.`;
  const changed = mode === 'pr' || verdict.gateOn === 'introduced' || verdict.reviewProvenance?.gateMode === 'introduced';
  return `Reviewed ${plural(files.length, changed ? 'changed test file' : 'test file')}${at}.`;
}

function reviewerLine(verdict) {
  const provenance = verdict.reviewProvenance && typeof verdict.reviewProvenance === 'object' ? verdict.reviewProvenance : {};
  const reviewer = [verdict.agent, verdict.model ?? provenance.modelIdentifier]
    .filter(isNonEmptyString)
    .map((part) => bounded(part, 80))
    .join(' / ');
  const versions = [
    isNonEmptyString(provenance.teaCliVersion) ? `TeA CLI ${bounded(provenance.teaCliVersion, 40)}` : null,
    provenance.skillRubricVersion != null && String(provenance.skillRubricVersion).trim() !== ''
      ? `rubric ${bounded(provenance.skillRubricVersion, 40)}`
      : null,
  ].filter(Boolean);
  const parts = [reviewer, ...versions].filter(Boolean);
  return parts.length > 0 ? `Reviewer: ${parts.join(' · ')}` : null;
}

/** Where the full report lives, said only as far as the caller can vouch for it. */
function reportLine({ runUrl, artifactName, reportPath, reportMissing, evidence, verdictOnly }) {
  const safeUrl = isNonEmptyString(runUrl) ? plain(runUrl).replaceAll(')', '%29') : null;
  const link = safeUrl ? `[Workflow run](${safeUrl})` : null;
  // A run that wrote no report uploads no artifact, so there is nothing to promise.
  if (reportMissing === true) {
    return ['The review wrote no report.', link].filter(Boolean).join(' ');
  }
  if (isNonEmptyString(artifactName) && evidence !== false) {
    const run = safeUrl ? ` of [this workflow run](${safeUrl})` : ' of this run';
    // A skip and a dry run write no report; only the verdict JSON is left to carry.
    return `${verdictOnly ? 'Verdict JSON' : 'Report and verdict JSON'}: the ${code(artifactName)} artifact${run}, once its upload step has finished.`;
  }
  if (verdictOnly) return link;
  if (isNonEmptyString(reportPath)) {
    const where = `The report is in the job workspace at ${code(reportPath)} and is deleted when the job ends unless the job uploads it.`;
    return [where, link].filter(Boolean).join(' ');
  }
  return link;
}

/**
 * The structured content of every surface. The three renderers below only lay it out, which is
 * what keeps them in agreement.
 */
function buildModel(verdict, context = {}) {
  const { state, gateFailed } = classify(verdict, context.exitCode);
  const hasVerdict = state !== 'broken' || (verdict && typeof verdict === 'object');
  const v = verdict && typeof verdict === 'object' ? verdict : {};
  const provenance = v.reviewProvenance && typeof v.reviewProvenance === 'object' ? v.reviewProvenance : {};
  // The commit the caller says the pull request is at outranks the checkout's HEAD, which on a
  // pull_request run is a merge commit no reader will find in the PR.
  const sha = shortSha(context.headSha) ?? shortSha(provenance.headSha);
  const files = fileList(v.files ?? v.reviewedFiles);
  const model = { state, gateFailed, headline: '', conclusion: 'neutral', lines: [], findings: [], overflow: 0, reviewer: null };

  const introduced = v.gateOn === 'introduced' || provenance.gateMode === 'introduced' || v.reviewMode === 'pr';

  switch (state) {
    case 'broken': {
      const meaning =
        context.exitCode === undefined || context.exitCode === null
          ? 'the run left no verdict'
          : `${exitMeaning(context.exitCode)} (exit ${context.exitCode})`;
      model.headline = 'Broken gate';
      model.conclusion = 'failure';
      model.lines.push(
        `The review produced no verdict: ${meaning}. Treat this gate as broken, not as approved tests.`,
        ...(isNonEmptyString(context.cause) ? [`Cause: ${bounded(context.cause, MAX_CAUSE_CHARS)}`] : []),
      );
      if (sha) model.lines.push(`Head ${code(sha)}.`);
      break;
    }
    case 'dry-run': {
      model.headline = 'No review performed';
      model.conclusion = 'neutral';
      model.lines.push(
        'The CLI ran with `--agent none`, so it built the prompt and stopped. This is a dry run, not a verdict.',
        `Files that would have been reviewed: ${files.length}.`,
        ...files.slice(0, MAX_LISTED_DRY_RUN_FILES).map((file) => `- ${code(file)}`),
        ...(files.length > MAX_LISTED_DRY_RUN_FILES ? [`- ... and ${files.length - MAX_LISTED_DRY_RUN_FILES} more`] : []),
      );
      break;
    }
    case 'skipped': {
      const contextCount = Array.isArray(v.contextFiles) ? v.contextFiles.length : 0;
      const changed = contextCount > 0 ? ` (${plural(contextCount, 'other file')} changed)` : '';
      const waivedSkip = v.waived === true;
      const waiverSuffix = waivedSkip ? ` until ${bounded(v.waiveUntil ?? 'an unspecified date', 40)}` : '';
      if (gateFailed) model.headline = 'Skipped, which fails this gate';
      else model.headline = waivedSkip ? `Skipped, failure waived${waiverSuffix}` : 'Skipped';
      model.conclusion = gateFailed ? 'failure' : 'neutral';
      const reason = isNonEmptyString(v.reason) ? bounded(v.reason, 300).replace(/\.$/, '') : 'No changed test files in this PR';
      model.lines.push(`${reason[0].toUpperCase()}${reason.slice(1)}${changed}.`);
      if (waivedSkip) {
        model.lines.push(`Gate failure waived${waiverSuffix}: ${bounded(v.waiveReason ?? 'no reason recorded', 300)}.`);
      }
      if (isNonEmptyString(context.focus)) {
        const focusLines = String(context.focus).split('\n').slice(0, MAX_FOCUS_LINES);
        const shown = cut(focusLines.join('\n'), MAX_FOCUS_CHARS);
        model.lines.push(
          '',
          'You asked me to focus on:',
          '',
          ...plain(shown)
            .split('\n')
            .map((line) => `> ${line}`),
          '',
          'There were no tests in scope to apply that to.',
          '',
        );
      }
      if (sha) model.lines.push(`Head ${code(sha)}.`);
      break;
    }
    default: {
      const gating = gatingFindings(v);
      model.findings = gating.slice(0, MAX_LISTED_FINDINGS).map((finding) => ({
        severity: severityLabel(finding.severity),
        location: bounded(findingLocation(finding), 200),
        title: bounded(finding.title ?? finding.criterion_id ?? 'Untitled finding', 200),
      }));
      model.overflow = Math.max(0, gating.length - MAX_LISTED_FINDINGS);
      const recommendation = isNonEmptyString(v.recommendation) ? v.recommendation : null;
      const waiverSuffix = v.waived === true ? ` until ${bounded(v.waiveUntil ?? 'an unspecified date', 40)}` : '';

      if (state === 'pass') {
        model.headline = introduced ? 'Pass for the changed tests' : 'Pass for the reviewed tests';
        model.conclusion = 'success';
      } else if (state === 'waived') {
        model.headline = `${bounded(recommendation ?? 'Verdict failure', 60)}, waived${waiverSuffix}`;
        model.conclusion = 'success';
      } else {
        model.headline = `Fail${recommendation ? `: ${bounded(recommendation, 60)}` : ''}`;
        model.conclusion = 'failure';
      }

      model.lines.push(scopeSentence(v, files, sha));
      if (state === 'waived') {
        model.lines.push(`Gate failure waived${waiverSuffix}: ${bounded(v.waiveReason ?? 'no reason recorded', 300)}.`);
      }
      const failures = Array.isArray(v.gateFailures) ? v.gateFailures.filter(isNonEmptyString) : [];
      if (gating.length === 0) {
        if (state === 'pass') model.lines.push(introduced ? 'No findings attributable to this PR.' : 'No findings affect the gate.');
        else if (failures.length === 0) model.lines.push(`Gating violations: ${countsLine(v.gatingViolations ?? v.violations)}.`);
      }
      if (failures.length > 0) {
        model.failures = failures.slice(0, MAX_LISTED_GATE_FAILURES).map((failure) => bounded(failure, 300));
        model.failureOverflow = Math.max(0, failures.length - MAX_LISTED_GATE_FAILURES);
      }
      if (state === 'pass' && recommendation && !PASSING_RECOMMENDATIONS.has(recommendation)) {
        model.lines.push(`Recommendation: ${bounded(recommendation, 60)}, which this gate's thresholds do not fail on.`);
      }
    }
  }

  if (hasVerdict && state !== 'broken') model.reviewer = reviewerLine(v);
  if (state === 'broken') {
    model.report = reportLine({ ...context, evidence: isNonEmptyString(context.reportPath) });
  } else {
    model.report = reportLine(state === 'skipped' || state === 'dry-run' ? { ...context, verdictOnly: true } : context);
  }
  model.agent = isNonEmptyString(context.agent) ? context.agent : isNonEmptyString(v.agent) ? v.agent : 'claude';
  return model;
}

function bodyLines(model) {
  const lines = [...model.lines];
  if (model.failures) {
    lines.push('', 'Gate failures:', ...model.failures.map((failure) => `- ${failure}`));
    if (model.failureOverflow > 0) lines.push(`- ... and ${model.failureOverflow} more in the verdict JSON`);
  }
  if (model.findings.length > 0) {
    lines.push('', 'Findings that affect the gate:');
    for (const finding of model.findings) {
      lines.push(`- **${finding.severity}** ${code(finding.location)}: ${finding.title}`);
    }
    if (model.overflow > 0) lines.push(`- ... and ${model.overflow} more in the report`);
  }
  if (model.reviewer) lines.push('', model.reviewer);
  if (model.report) lines.push('', model.report);
  return lines;
}

/** The pull request comment: its hidden marker, then the same text as the summary. */
function renderComment(verdict, context = {}) {
  const model = buildModel(verdict, context);
  const body = [buildCommentMarker(model.agent), `## TeA test quality: ${model.headline}`, '', ...bodyLines(model)].join('\n');
  return body.length > MAX_COMMENT_CHARS ? `${cut(body, MAX_COMMENT_CHARS)}\n\n_(truncated)_` : body;
}

/** A job summary or merge-request note: the comment without its marker. */
function renderSummary(verdict, context = {}) {
  const model = buildModel(verdict, context);
  return [`## TeA test quality: ${model.headline}`, '', ...bodyLines(model)].join('\n');
}

/** The check run's title, conclusion and summary text. */
function renderCheck(verdict, context = {}) {
  const model = buildModel(verdict, context);
  return { title: model.headline, conclusion: model.conclusion, summary: bodyLines(model).join('\n') };
}

module.exports = {
  LEGACY_COMMENT_MARKER,
  MAX_LISTED_FINDINGS,
  MAX_COMMENT_CHARS,
  looksLikeVerdict,
  contradiction,
  EXIT_MEANING,
  buildCommentMarker,
  buildModel,
  classify,
  exitMeaning,
  renderCheck,
  renderComment,
  renderSummary,
};
