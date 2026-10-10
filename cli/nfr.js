#!/usr/bin/env node
/** Audit existing project NFR evidence with the packaged skill. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Command } = require('commander');
const { resolveTeaConfig, CONFIG_LAYER_RELATIVE_PATHS, LEGACY_CONFIG_RELATIVE_PATH } = require('./lib/resolve-tea-config');
const { inventory, protectSources, protectPublication, freshArtifact, publishArtifacts } = require('./lib/workflow-publication');
const { readNfrReport } = require('./lib/nfr-report');
const {
  WorkflowError,
  addAgentOptions,
  readInput,
  projectPath,
  resolveWorkflowSkill,
  headlessPrompt,
  runWithEvidence,
  mainError,
} = require('./lib/workflow-cli');
const collect = (value, previous) => [...previous, value];
/** Resolve a nonempty explicitly supplied source role. */
function sourceFiles(projectRoot, values, label) {
  const { files } = inventory(projectRoot, values);
  if (files.length === 0) throw new WorkflowError('usage', `${label} must supply at least one regular file`);
  return files;
}
/** Verify unchanged sources and fresh actual workflow outputs. */
function validateAudit(request) {
  request.protection.assertUnchanged();
  const report = freshArtifact(request.attemptDir, request.reportFile);
  const contextFile = freshArtifact(request.attemptDir, request.contextFile);
  let context;
  try {
    context = JSON.parse(contextFile.text);
  } catch (error) {
    throw new WorkflowError('environment-parser', `invalid NFR context JSON: ${error.message}`, { cause: error });
  }
  return { ...readNfrReport(report.text, context, request), artifacts: [report, contextFile] };
}
/** Invoke the actual installed Create workflow and publish its validated audit. */
function run(argv) {
  const program = addAgentOptions(
    new Command().name('tea-nfr').description('Audit existing NFR evidence and publish a verified scope-specific report.'),
  );
  program
    .option('--project-root <dir>', 'consuming project root', process.cwd())
    .option('--skill-root <dir>', 'trusted skill override; packaged skill by default')
    .requiredOption('--input <path>', 'requirements document (repeatable)', collect, [])
    .requiredOption('--implementation <path>', 'accessible implementation file or directory (repeatable)', collect, [])
    .requiredOption('--evidence <path>', 'existing evidence file or directory (repeatable)', collect, [])
    .option('--scope <name>', 'system, epic or story', 'system')
    .option('--scope-id <id>', 'epic or story stable lowercase ID; required for narrower scope')
    .option('--output-dir <dir>', 'published artifact root inside the project; defaults to TEA test_artifacts')
    .option('--evidence-dir <dir>', 'retained live prompts, streams and generated reports', '.tea-runs')
    .option('--fail-on <status>', 'gate threshold: concerns, fail or none', 'concerns')
    .setOptionValue('retries', '0')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  program.options.find((option) => option.long === '--retries').defaultValue = '0';
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return 0;
    throw new WorkflowError('usage', error.message);
  }
  const options = program.opts();
  if (options.input.length === 0) throw new WorkflowError('usage', '--input requires at least one requirements document');
  let projectRoot;
  try {
    projectRoot = fs.realpathSync(path.resolve(options.projectRoot));
  } catch (error) {
    throw new WorkflowError('usage', '--project-root must exist', { cause: error });
  }
  if (!['system', 'epic', 'story'].includes(options.scope)) throw new WorkflowError('usage', '--scope must be system, epic or story');
  if (options.scope === 'system' && options.scopeId) throw new WorkflowError('usage', '--scope-id requires epic or story scope');
  if (options.scope !== 'system' && (!options.scopeId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.scopeId)))
    throw new WorkflowError('usage', 'epic or story scope requires a stable lowercase --scope-id');
  if (!['concerns', 'fail', 'none'].includes(options.failOn)) throw new WorkflowError('usage', '--fail-on must be concerns, fail or none');
  const configurationInputs = [...CONFIG_LAYER_RELATIVE_PATHS, LEGACY_CONFIG_RELATIVE_PATH]
    .filter((file) => fs.existsSync(path.join(projectRoot, file)))
    .map((file) => readInput(projectRoot, file, 'configuration'));
  const inputs = [...new Set([...options.input.map((file) => readInput(projectRoot, file, '--input')), ...configurationInputs])];
  const implementation = sourceFiles(projectRoot, options.implementation, '--implementation');
  const evidenceFiles = sourceFiles(projectRoot, options.evidence, '--evidence');
  if (
    inputs.some((file) =>
      evidenceFiles.some((evidence) => {
        const a = fs.statSync(file),
          b = fs.statSync(evidence);
        return file === evidence || (a.dev === b.dev && a.ino === b.ino);
      }),
    )
  )
    throw new WorkflowError('usage', 'requirement inputs cannot also be implementation evidence');
  const protection = protectSources(projectRoot, [...inputs, ...options.implementation, ...options.evidence]);
  const skillRoot = resolveWorkflowSkill({ projectRoot, skillName: 'bmad-testarch-nfr', skillRoot: options.skillRoot });
  const resolvedConfig = resolveTeaConfig({ projectRoot, skillRoot, skillName: 'bmad-testarch-nfr' });
  const artifactRoot = options.outputDir ?? resolvedConfig.configSnapshot.modules.tea.test_artifacts;
  if (typeof artifactRoot !== 'string' || !artifactRoot.trim())
    throw new WorkflowError('environment-configuration', '--output-dir or TEA test_artifacts must be a nonempty string');
  const outputDir = projectPath(projectRoot, artifactRoot.replaceAll('{project-root}', projectRoot), '--output-dir');
  const runKey = options.scope === 'system' ? 'system' : `${options.scope}-${options.scopeId}`;
  const filename = `nfr-assessment-${runKey}.md`;
  const destination = projectPath(projectRoot, path.join(outputDir, 'nfr', filename), 'published report');
  const contextFilename = `nfr-context-${runKey}.json`;
  const contextDestination = projectPath(projectRoot, path.join(outputDir, 'nfr', contextFilename), 'published context');
  const destinations = [destination, contextDestination];
  const checkDestination = () => protectPublication(projectRoot, [...destinations, options.evidenceDir], protection);
  checkDestination();
  const result = runWithEvidence({
    name: 'tea-nfr',
    projectRoot,
    evidenceRoot: options.evidenceDir,
    options,
    prepare({ attemptDir }) {
      const artifactsRoot = path.join(attemptDir, 'artifacts');
      const config = {
        ...resolvedConfig,
        configSnapshot: {
          core: resolvedConfig.configSnapshot.core,
          modules: { tea: { ...resolvedConfig.configSnapshot.modules.tea, test_artifacts: artifactsRoot } },
        },
      };
      const reportFile = path.join('artifacts', 'nfr', filename);
      const contextFile = path.join('artifacts', 'nfr', contextFilename);
      const requestId = crypto.randomUUID();
      const contract = {
        schemaVersion: 1,
        requestId,
        runScope: options.scope,
        runKey,
        supplied_project_root: projectRoot,
        declared_nfr_criteria: Object.fromEntries(
          ['security', 'performance', 'reliability', 'maintainability'].map((domain) => [domain, []]),
        ),
        recorded_only_nfr_criteria: [],
        supplied_evidence_ledger: [],
        domain_assessments: Object.fromEntries(
          ['security', 'performance', 'reliability', 'maintainability'].map((domain) => [
            domain,
            { status: 'N/A', findings: [], evidence_gaps: [] },
          ]),
        ),
      };
      const requestLines = [
        `Start Create mode at ${JSON.stringify(path.join(skillRoot, 'steps-c', 'step-01-load-context.md'))}.`,
        `run_scope=${options.scope}; run_key=${runKey}; tea_browser_automation=none`,
        `supplied_project_root=${JSON.stringify(projectRoot)}`,
        `Requirement inputs are exactly this JSON list: ${JSON.stringify(inputs)}.`,
        `Implementation files are accessible at exactly this JSON list: ${JSON.stringify(implementation)}.`,
        `Existing implementation evidence is exactly this JSON list: ${JSON.stringify(evidenceFiles)}.`,
        'Read and audit this existing implementation evidence. Preserve all supplied files. Read-only file inspection is allowed. Do not execute project tests, build scripts, deploy scripts, CI jobs or browser exploration.',
        `Produce a completed scope-specific audit at ${JSON.stringify(path.join(attemptDir, reportFile))}.`,
        `Persist your actual step02/03/04E canonical workflow context at ${JSON.stringify(path.join(attemptDir, contextFile))}. Required shape (empty arrays are shape examples, fill all actual declared criteria): ${JSON.stringify(contract)}.`,
        'Each declared criterion has {id,order,label,threshold,threshold_source}; use actual stable criterion IDs and source order. Each recorded-only criterion also has domain and assessment_mode=recorded-only.',
        'Use canonical project-relative threshold_source paths from requirement inputs. Copy the threshold as a literal source excerpt (line wrapping may normalize), or UNKNOWN. Do not invent threshold policy.',
        'Each ledger entry has {path,source: supplied,source_type: implementation-evidence,domains,observations:[{criterion_id,supports}]}. Copy supports as literal factual excerpts from that exact supplied file. Sort paths and observations; deduplicate. Include all actual supported criterion bindings.',
        'Each domain_assessments entry has {status,findings:[{criterion_id,status,evidence:[{path,supports}]}],evidence_gaps:[{criterion_id,message}]}. Match every declared criterion in source order, with all its bound ledger observations. Missing evidence has one gap with message "Label: no supplied implementation evidence". UNKNOWN threshold with evidence has one gap with message "Label: UNKNOWN threshold". Replace Label with the exact criterion label. Never manufacture implementation evidence from requirement documents.',
        'Follow the actual workflow and checklist. Preserve completed steps and run identity in frontmatter. Include exactly one Gate YAML Snippet with nfr_assessment and the four audited_domains.',
        'Under every audited domain, render each declared criterion as a ### subsection with separate bold Status, Threshold, Threshold Source, Actual, Evidence and Supports fields. Threshold Source is one backtick-quoted canonical requirement path. Actual is a copied implementation source excerpt, or UNKNOWN. Evidence lists all bound ledger paths in backticks. Supports includes each literal bound excerpt. With no evidence, use Evidence: None, Supports: None and Actual: UNKNOWN. Evidence paths must be backtick-quoted paths relative to the supplied project root and present in the supplied evidence list. Requirements are threshold sources.',
        'Preserve the completed Create progress steps in exact workflow order and a valid lastSaved timestamp. Keep all populated report-template sections. Gate concerns/evidence_gaps counts equal normalized criterion concerns/gaps. Recorded-only declarations use a separate Recorded-Only NFR Criteria table with ID, category, label, threshold, source and RECORDED ONLY mode; they have no audited finding/status/gate impact.',
        'Use only declared requirements and existing evidence. Record UNKNOWN thresholds and missing evidence as required by the skill. Complete all workflow steps without modifying source inputs.',
      ];
      return {
        prompt: headlessPrompt({ skillRoot, projectRoot, resolvedConfig: config, requestLines }),
        reportFile,
        projectRoot,
        runScope: options.scope,
        runKey,
        requestId,
        contextFile,
        protection,
        inputs,
        evidenceFiles,
      };
    },
    validate: validateAudit,
  });
  if (result.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'prompt-only', evidence: result.runDir, prompt: path.join(result.attemptDir, 'prompt.txt') })}\n`,
    );
    return 0;
  }
  checkDestination();
  const published = publishArtifacts(
    result.value.artifacts.map((artifact, index) => ({ ...artifact, destination: destinations[index] })),
    { projectRoot, runDir: result.runDir, protection },
  );
  const failed =
    options.failOn !== 'none' && (result.value.status === 'FAIL' || (options.failOn === 'concerns' && result.value.status === 'CONCERNS'));
  const gatePassed = !failed;
  process.stdout.write(
    `${JSON.stringify({ mode: 'live', runKey, status: result.value.status, gatePassed, evidence: result.runDir, report: published[0], context: published[1], gate: result.value.gate })}\n`,
  );
  return failed ? 1 : 0;
}
/** Run the public command with stable configuration and execution exit codes. */
function main(argv) {
  try {
    return run(argv);
  } catch (error) {
    return mainError('tea-nfr', error);
  }
}
if (require.main === module) process.exitCode = main(process.argv);
module.exports = { main, validateAudit, sourceFiles };
