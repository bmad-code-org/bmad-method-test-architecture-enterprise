/**
 * Release metadata validation for publishable builds.
 *
 * Verifies:
 * - package.json, package-lock.json, and marketplace.json share the same version
 * - the package is not marked private
 * - publishConfig.access remains public
 *
 * Usage: node test/test-release-metadata.js
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const marketplacePath = path.join(projectRoot, '.claude-plugin', 'marketplace.json');

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Release metadata validation failed: unable to read ${label} at ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

const packageJson = readJson(packageJsonPath, 'package.json');
const packageLock = readJson(packageLockPath, 'package-lock.json');
const marketplace = readJson(marketplacePath, '.claude-plugin/marketplace.json');
const marketplacePlugin = (marketplace.plugins || []).find((plugin) => plugin && plugin.name === packageJson.name);

const errors = [];

if (packageJson.private === true) {
  errors.push('package.json must not set "private": true when publishing to npm.');
}

if (packageJson.publishConfig?.access !== 'public') {
  errors.push('package.json must set publishConfig.access to "public".');
}

if (packageLock.version !== packageJson.version) {
  errors.push(`package-lock.json version ${packageLock.version} does not match package.json version ${packageJson.version}.`);
}

if (packageLock.packages?.['']?.version !== packageJson.version) {
  errors.push(
    `package-lock.json root package version ${packageLock.packages?.['']?.version} does not match package.json version ${packageJson.version}.`,
  );
}

if (!marketplacePlugin) {
  errors.push(`.claude-plugin/marketplace.json is missing the plugin entry for ${packageJson.name}.`);
} else if (marketplacePlugin.version !== packageJson.version) {
  errors.push(
    `.claude-plugin/marketplace.json version ${marketplacePlugin.version} does not match package.json version ${packageJson.version}.`,
  );
}

if (errors.length > 0) {
  console.error('Release metadata validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release metadata is synchronized and publishable for v${packageJson.version}.`);
