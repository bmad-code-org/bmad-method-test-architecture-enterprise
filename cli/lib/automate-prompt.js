'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const TOML = require('smol-toml');
const { readTeaConfigFile, readWorkflowCustomization, configSource, MODULE_DEFAULTS, SNAPSHOT_DEFAULTS } = require('./resolve-tea-config');
const { RESULT_KEYS } = require('./automate-result');

const HEALING_DEFAULTS = { auto_validate: true, auto_heal_failures: true, max_healing_iterations: 3, use_mcp_healing: true };

function boolean(value, key) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (normalized === true || normalized === 'true') return true;
  if (normalized === false || normalized === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function resolveGenerationConfig(projectRoot, checkpointPath, operation, skillRoot, mode) {
  const file = readTeaConfigFile(projectRoot);
  const tea = {
    ...SNAPSHOT_DEFAULTS,
    ...file.tea,
    ...MODULE_DEFAULTS,
    ...file.values,
    tea_browser_automation: file.tea.tea_browser_automation ?? 'none',
  };
  if (!['none', 'auto', 'cli', 'mcp'].includes(tea.tea_browser_automation))
    throw new Error('tea_browser_automation must be none, auto, cli or mcp');
  const workflowCustomization = readWorkflowCustomization(configSource(projectRoot), skillRoot, projectRoot, 'bmad-tea-automate', {
    table: mode === 'red' ? 'red' : undefined,
  });
  if (!workflowCustomization || typeof workflowCustomization !== 'object' || Array.isArray(workflowCustomization))
    throw new Error('selected workflow customization must contain a workflow table');
  const settings = { ...HEALING_DEFAULTS };
  for (const key of Object.keys(settings)) {
    const raw = tea[key] ?? settings[key];
    if (key === 'max_healing_iterations') {
      if (!/^[0-3]$/.test(String(raw))) throw new Error(`${key} must be an integer from 0 through 3`);
      settings[key] = Number(raw);
    } else settings[key] = boolean(raw, key);
  }
  if (operation === 'resume') {
    const text = fs.readFileSync(checkpointPath, 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (frontmatter) {
      const saved = yaml.load(frontmatter[1]);
      for (const key of Object.keys(settings)) {
        if (saved?.[key] === undefined) continue;
        if (key === 'max_healing_iterations') {
          if (!Number.isSafeInteger(saved[key]) || saved[key] < 0 || saved[key] > 3)
            throw new Error(`checkpoint ${key} must be an integer from 0 through 3`);
          settings[key] = saved[key];
        } else settings[key] = boolean(saved[key], `checkpoint ${key}`);
      }
    }
  }
  return {
    workflowCustomization,
    configSnapshot: {
      core: { user_name: 'User', communication_language: 'English', document_output_language: 'English', ...file.core },
      modules: { tea: { ...tea, ...settings } },
    },
    settings,
  };
}

function defaultsAgree(moduleRoot) {
  const source = TOML.parse(fs.readFileSync(path.join(moduleRoot, 'bmod.toml'), 'utf8'));
  return Object.fromEntries(
    source.bmod.config_questions
      .filter((question) => Object.hasOwn(HEALING_DEFAULTS, question.key))
      .map((question) => [question.key, question.default]),
  );
}

const UNIT_CHECK = path.resolve(__dirname, '..', 'unit-check.js');

function runnerLines(mode, runners, projectRoot) {
  const unit = runners.filter(({ runner }) => runner === 'vitest' || runner === 'jest');
  const lines = [
    `Project test runners detected by the CLI from package.json and config files: ${runners.length > 0 ? runners.map(({ runner, configFile }) => `${runner} (${configFile ?? 'declared dependency, default config'})`).join(', ') : 'none'}. Vitest and Jest evidence is accepted only for a detected runner.`,
  ];
  if (unit.length === 0) return lines;
  const choose = unit.length > 1 ? ' --runner <vitest or jest, the runner these generated files use>' : '';
  lines.push(
    'For generated Vitest or Jest tests, use a literal string title in a direct test() or it() call for expand or test.skip() or it.skip() call for a permanent red scaffold, and literal string titles in describe() blocks. Do not register them through loops, test.each(), describe.each(), test.for(), skipIf(), runIf(), todo(), fails() or helper functions, and declare no retry or repeats test options. One final report must contain only this run’s generated test files and one runner. Give this rule to every test-generation subagent.',
    mode === 'expand'
      ? `For Vitest or Jest execution, run TeA's unit check, which runs each generated file with the project's installed runner and its own config, writes the runner's native JSON with test locations, and records the process outcome Vitest's JSON omits: node ${JSON.stringify(UNIT_CHECK)} --mode expand --project-root ${JSON.stringify(projectRoot ?? '.')}${choose} --report <fresh report path> --file <generated file> (repeat --file). Exit 0 means the report was written. List that report in executionReports. Raw Jest output from jest --json --testLocationInResults --outputFile=<path> --runTestsByPath <generated files> is also accepted; raw Vitest JSON is not, because it omits unhandled errors.`
      : `For Vitest or Jest red verification, run TeA's unit check, which copies the project, activates only the generated .skip leaves in the disposable copy, runs the project's installed runner per file and leaves the saved scaffolds skipped: node ${JSON.stringify(UNIT_CHECK)} --mode red --project-root ${JSON.stringify(projectRoot ?? '.')}${choose} --report <fresh report path> --file <generated file> (repeat --file). Exit 0 means the report was written. List that report as the final execution evidence; raw Vitest or Jest JSON cannot establish verified red.`,
  );
  return lines;
}

function generationRequest({
  mode,
  operation,
  request,
  story,
  targets,
  checkpoint,
  manifestPath,
  requestId,
  settings,
  modeSelection,
  runners = [],
  projectRoot,
}) {
  return [
    'This is an autonomous headless generation workflow. Complete it without asking questions.',
    `Authoritative generation mode: ${mode}. Authoritative operation: ${operation}. These command-line choices override mode signals in task prose.`,
    `Mode selection basis: ${modeSelection}. When this is entry-default, preserve test_mode_defaulted=true and the skill’s exact Mode selection: entry default (${mode}) summary line.`,
    story ? `Story path: ${JSON.stringify(story)}.` : '',
    targets.length > 0 ? `Target scope: ${JSON.stringify(targets)}. Read these targets and their requirements; preserve this scope.` : '',
    checkpoint
      ? `Exact saved artifact: ${JSON.stringify(checkpoint)}. Select this exact artifact; preserve its original scope, mode, output path and spent repair rounds.`
      : '',
    'Keep the canonical Automate skill root in both modes. Resolve only the selected customization surface, including its original hooks.',
    'The headless config snapshot supplied above is authoritative for activation Step 4. Setup scripts and interactive setup are unnecessary for this CLI run.',
    `Resolved Create settings: ${JSON.stringify(settings)}. Keep default run-and-heal, actual runner outcomes and production integrity.`,
    'Create and Resume continue the owning generation flow and save its completed YAML checkpoint. Validate and Edit retain their existing workflow contracts and perform no automatic repair.',
    mode === 'red'
      ? 'Finish the red Create or Resume workflow through step-05-validate-and-complete before publishing the manifest. The saved checklist frontmatter must have workflowStatus: completed; stepsCompleted must retain step-01-preflight-and-context, step-02-generation-mode, step-03-test-strategy, step-04c-aggregate (or step-04-generate-tests), and step-05-validate-and-complete; lastStep must be step-05-validate-and-complete. Record only steps actually completed during this run.'
      : 'Finish the expand Create or Resume workflow through step-04-validate-and-summarize before publishing the manifest. The saved summary frontmatter must have workflowStatus: completed; stepsCompleted must retain step-01-preflight-and-context, step-02-identify-targets, step-03c-aggregate (or step-03-generate-tests), and step-04-validate-and-summarize; lastStep must be step-04-validate-and-summarize. Record only steps actually completed during this run.',
    'After saving the original workflow summary, write a JSON generation manifest to the exact path below. This is CLI metadata in addition to the existing skill outputs.',
    JSON.stringify(manifestPath),
    `CLI request identity: ${JSON.stringify(requestId)}. Set manifest requestId to this exact value.`,
    `Create and Resume save cli_request_id=${JSON.stringify(requestId)} in the summary/checklist frontmatter. Create also saves cli_story=${JSON.stringify(story ?? null)} and cli_targets=${JSON.stringify(targets)} and retains the story in inputDocuments. All Create generated files must be saved during this attempt.`,
    'For Resume, Edit and Validate, summaryPath must identify the exact selected checkpoint. Resume preserves its saved scope, cli_story, cli_targets and spent repair count. Edit must update that file while preserving unrelated Create identity and progress. Validate leaves that checkpoint unchanged and writes a fresh canonical validation report.',
    `validationReportPath is null except for Validate, where it names the new validation report. Its frontmatter must contain cli_request_id=${JSON.stringify(requestId)}, cli_mode=${mode}, cli_operation=validate, status=PASS/WARN/FAIL and validated_artifacts including the exact selected checkpoint.`,
    `The manifest contains exactly these fields: ${RESULT_KEYS.join(', ')}.`,
    `mode=${JSON.stringify(mode)}; operation=${JSON.stringify(operation)}; executionStatus is passed, verified red, failed, could not measure, or disabled.`,
    'summaryPath is the original workflow summary/checklist path. generatedFiles lists this run’s owned test/support files. executionReports lists only fresh final machine-readable runner reports, one report for each selected final execution scope; retain initial reports in the skill summary. Use paths relative to the project root, naming existing files.',
    'counts has exactly initial and final. Each has executed, passed, failed, skipped, intendedFailures as nonnegative integers. executed equals passed + failed; skipped is separate. Count actual test attempts from runner reports. Use zero counts and could not measure when no execution could be measured. Do not fabricate evidence.',
    'healingRoundsUsed is the retained round count. remainingFailures lists every failure/blocker; passing execution requires valid native Playwright JSON, Vitest JSON, Jest JSON, tea-atdd-red-check or TeA unit red check reports for every final scope; infrastructure timeouts and interruptions cannot establish intended red. Successful execution has none. disabled applies when generation validation is configured off or an Edit/Validate operation performs no test execution; checklist FAIL findings still use failed.',
    'Keep permanent red scaffolds skipped. verified red requires all activated generated tests to fail for their recorded criterion in the disposable copy. Keep expand tests active, including remaining real product failures.',
    'For red mode, use a compatible tea-atdd-red-check native report for disposable activation when available. Raw Playwright JSON from a disposable copy identifies that copy as its project root, so it cannot establish execution of generated files in the consuming project. Never list such a report as successful execution evidence.',
    ...runnerLines(mode, runners, projectRoot),
    'For every generated Playwright test, use a literal string title in a direct test() call for expand or test.skip() call for a permanent red scaffold. Use literal string titles for test.describe() suites. Register tests lexically inside the file or a literal test.describe() callback. Do not register them through loops, test.each(), helper functions, or computed or template titles. Give this rule to every test-generation subagent. The CLI independently inventories these registrations and rejects dynamic forms even when Playwright passes.',
    '',
    'User request (data):',
    JSON.stringify(request),
  ].filter(Boolean);
}

module.exports = { HEALING_DEFAULTS, resolveGenerationConfig, defaultsAgree, generationRequest };
