'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const TOML = require('smol-toml');
const { readTeaConfigFile, MODULE_DEFAULTS, SNAPSHOT_DEFAULTS } = require('./resolve-tea-config');
const { RESULT_KEYS } = require('./automate-result');

const HEALING_DEFAULTS = { auto_validate: true, auto_heal_failures: true, max_healing_iterations: 3, use_mcp_healing: true };

function boolean(value, key) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function merge(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) {
    const key = [...base, ...override].every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      ? ['code', 'id'].find((candidate) => [...base, ...override].every((entry) => Object.hasOwn(entry, candidate)))
      : undefined;
    if (!key) return [...base, ...override];
    const result = [...base];
    for (const entry of override) {
      const index = result.findIndex((previous) => previous[key] === entry[key]);
      if (index === -1) result.push(entry);
      else result[index] = entry;
    }
    return result;
  }
  if (base && override && typeof base === 'object' && typeof override === 'object' && !Array.isArray(base) && !Array.isArray(override)) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) result[key] = merge(result[key], value);
    return result;
  }
  return override;
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
  const namespace = mode === 'red' ? 'bmad-testarch-atdd' : 'bmad-testarch-automate';
  const sibling = path.join(skillRoot, '..', namespace, 'customize.toml');
  const defaultsPath =
    mode === 'red' && !fs.existsSync(sibling)
      ? path.join(skillRoot, 'red', 'customize.toml')
      : path.join(mode === 'red' ? path.dirname(sibling) : skillRoot, 'customize.toml');
  let customization = {};
  for (const candidate of [
    defaultsPath,
    path.join(projectRoot, '_bmad', 'custom', `${namespace}.toml`),
    path.join(projectRoot, '_bmad', 'custom', `${namespace}.user.toml`),
  ]) {
    if (fs.existsSync(candidate)) customization = merge(customization, TOML.parse(fs.readFileSync(candidate, 'utf8')));
  }
  if (!customization.workflow || typeof customization.workflow !== 'object' || Array.isArray(customization.workflow))
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
    workflowCustomization: customization.workflow,
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

function generationRequest({ mode, operation, request, story, targets, checkpoint, manifestPath, requestId, settings, modeSelection }) {
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
    'healingRoundsUsed is the retained round count. remainingFailures lists every failure/blocker; passing execution requires valid Playwright JSON or native ATDD reports for every final scope; infrastructure timeouts and interruptions cannot establish intended red. Successful execution has none. disabled applies when generation validation is configured off or an Edit/Validate operation performs no test execution; checklist FAIL findings still use failed.',
    'Keep permanent red scaffolds skipped. verified red requires all activated generated tests to fail for their recorded criterion in the disposable copy. Keep expand tests active, including remaining real product failures.',
    '',
    'User request (data):',
    JSON.stringify(request),
  ].filter(Boolean);
}

module.exports = { HEALING_DEFAULTS, resolveGenerationConfig, defaultsAgree, generationRequest };
