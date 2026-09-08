/**
 * Reading side of the suite manifest: load it, validate it, and answer the one
 * question `eval:all` has to ask before it runs anything, which is whether
 * every TEA skill is either covered or explicitly deferred.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateSuiteManifest } = require('../schema/suite-manifest');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const MANIFEST_RELATIVE_PATH = path.join('test', 'evals', 'suite-manifest.json');

function manifestError(message) {
  const error = new Error(message);
  error.code = 'EVAL_MANIFEST_INVALID';
  return error;
}

/**
 * Load and validate test/evals/suite-manifest.json.
 *
 * @param {string} [projectRoot]
 * @returns {{manifest: object, manifestPath: string}}
 * @throws {Error} EVAL_MANIFEST_INVALID when the file is missing, unparseable, or off-schema.
 */
function loadSuiteManifest(projectRoot = PROJECT_ROOT) {
  const manifestPath = path.join(projectRoot, MANIFEST_RELATIVE_PATH);
  if (!fs.existsSync(manifestPath)) throw manifestError(`no suite manifest at ${MANIFEST_RELATIVE_PATH}`);

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw manifestError(`${MANIFEST_RELATIVE_PATH} is not valid JSON: ${error.message}`);
  }

  const result = validateSuiteManifest(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    throw manifestError(`${MANIFEST_RELATIVE_PATH} does not match its schema:\n${issues}`);
  }
  return { manifest: result.data, manifestPath };
}

/**
 * The skills one suite entry speaks for.
 *
 * @param {object} entry
 * @returns {string[]}
 */
function skillsOf(entry) {
  return entry.skills ?? [entry.skill];
}

/**
 * Skills with neither a behavioral suite nor a deferred declaration.
 *
 * Fragment selection deliberately does not count. It measures which knowledge a
 * run loads, which happens before the workflow produces anything, so treating
 * it as coverage is exactly the false claim this check exists to block.
 *
 * @param {object} manifest
 * @param {string[]} skills Every TEA skill, read off the repository.
 * @returns {string[]}
 */
function unaccountedSkills(manifest, skills) {
  const accounted = new Set(manifest.deferred.map((entry) => entry.skill));
  for (const entry of manifest.suites) {
    if (entry.evalType !== 'behavioral') continue;
    for (const skill of skillsOf(entry)) accounted.add(skill);
  }
  return skills.filter((skill) => !accounted.has(skill)).sort();
}

/**
 * @param {object} manifest
 * @param {string} id
 * @returns {object}
 * @throws {Error} EVAL_MANIFEST_INVALID when the suite is not registered.
 */
function suiteById(manifest, id) {
  const entry = manifest.suites.find((suite) => suite.id === id);
  if (!entry) throw manifestError(`${MANIFEST_RELATIVE_PATH} registers no suite with id "${id}"`);
  return entry;
}

module.exports = {
  loadSuiteManifest,
  skillsOf,
  unaccountedSkills,
  suiteById,
  MANIFEST_RELATIVE_PATH,
  PROJECT_ROOT,
};
