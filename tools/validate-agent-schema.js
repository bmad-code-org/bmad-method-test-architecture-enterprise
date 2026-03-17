/**
 * Agent Schema Validator CLI
 *
 * Scans for agent definitions in src/agents/:
 * - Legacy format: *.agent.yaml (validated against Zod schema)
 * - Native skill format: {name}/bmad-skill-manifest.yaml + SKILL.md
 *
 * Usage: node tools/validate-agent-schema.js [project_root]
 * Exit codes: 0 = success, 1 = validation failures
 *
 * Optional argument:
 *   project_root - Directory to scan (defaults to BMAD repo root)
 */

const { glob } = require('glob');
const yaml = require('yaml');
const fs = require('node:fs');
const path = require('node:path');
const { validateAgentFile } = require('./schema/agent.js');

/**
 * Main validation routine
 * @param {string} [customProjectRoot] - Optional project root to scan (for testing)
 */
async function main(customProjectRoot) {
  console.log('🔍 Scanning for agent files...\n');

  // Determine project root: use custom path if provided, otherwise default to repo root
  const project_root = customProjectRoot || path.join(__dirname, '..');

  // Find all agent files
  // TEA module supports both legacy (*.agent.yaml) and native skill format (*/bmad-skill-manifest.yaml)
  const agentFiles = await glob('src/agents/*.agent.yaml', {
    cwd: project_root,
    absolute: true,
  });

  // Always check for native skill manifests (supports mixed-mode repos)
  const skillManifests = await glob('src/agents/*/bmad-skill-manifest.yaml', {
    cwd: project_root,
    absolute: true,
  });

  // If no legacy agents found, validate native skills or fail
  if (agentFiles.length === 0) {
    if (skillManifests.length > 0) {
      console.log(`Found ${skillManifests.length} native skill manifest(s) (no legacy *.agent.yaml files)\n`);

      const manifestErrors = [];
      for (const manifestPath of skillManifests) {
        const relativePath = path.relative(process.cwd(), manifestPath);
        try {
          const fileContent = fs.readFileSync(manifestPath, 'utf8');
          const manifest = yaml.parse(fileContent);

          const requiredFields = ['type', 'name', 'module', 'canonicalId'];
          const missingFields = requiredFields.filter((f) => !manifest[f]);
          const issues = [];

          if (missingFields.length > 0) {
            issues.push({ message: `Missing required fields: ${missingFields.join(', ')}`, path: [] });
          }

          // Validate type value
          const validTypes = ['agent', 'skill'];
          if (manifest.type && !validTypes.includes(manifest.type)) {
            issues.push({ message: `Invalid type "${manifest.type}". Expected one of: ${validTypes.join(', ')}`, path: [] });
          }

          // Verify SKILL.md exists alongside the manifest
          const skillMdPath = path.join(path.dirname(manifestPath), 'SKILL.md');
          if (!fs.existsSync(skillMdPath)) {
            issues.push({ message: 'Missing SKILL.md file alongside manifest', path: [] });
          }

          if (issues.length > 0) {
            manifestErrors.push({ file: relativePath, issues });
          } else {
            console.log(`✅ ${relativePath}`);
          }
        } catch (error) {
          manifestErrors.push({
            file: relativePath,
            issues: [{ message: `Failed to parse YAML: ${error.message}`, path: [] }],
          });
        }
      }

      if (manifestErrors.length > 0) {
        console.log('\n❌ Validation failed:\n');
        for (const { file, issues } of manifestErrors) {
          console.log(`\n📄 ${file}`);
          for (const issue of issues) {
            console.log(`   Error: ${issue.message}`);
          }
        }
        process.exit(1);
      }

      console.log(`\n✨ All ${skillManifests.length} native skill manifest(s) passed validation!\n`);
      process.exit(0);
    }

    console.log('❌ No agent files found. This likely indicates a configuration error.');
    console.log('   Expected to find *.agent.yaml files or native skill manifests in src/agents/');
    process.exit(1);
  }

  console.log(`Found ${agentFiles.length} agent file(s)\n`);

  const errors = [];

  // Validate each file
  for (const filePath of agentFiles) {
    const relativePath = path.relative(process.cwd(), filePath);

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const agentData = yaml.parse(fileContent);

      // Convert absolute path to relative src/ path for module detection
      const srcRelativePath = relativePath.startsWith('src/') ? relativePath : path.relative(project_root, filePath).replaceAll('\\', '/');

      const result = validateAgentFile(srcRelativePath, agentData);

      if (result.success) {
        console.log(`✅ ${relativePath}`);
      } else {
        errors.push({
          file: relativePath,
          issues: result.error.issues,
        });
      }
    } catch (error) {
      errors.push({
        file: relativePath,
        issues: [
          {
            code: 'parse_error',
            message: `Failed to parse YAML: ${error.message}`,
            path: [],
          },
        ],
      });
    }
  }

  // Also validate native skill manifests in mixed-mode repos
  if (skillManifests.length > 0) {
    console.log(`\nAlso found ${skillManifests.length} native skill manifest(s)\n`);
    for (const manifestPath of skillManifests) {
      const relativePath = path.relative(process.cwd(), manifestPath);
      try {
        const fileContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = yaml.parse(fileContent);
        const requiredFields = ['type', 'name', 'module', 'canonicalId'];
        const missingFields = requiredFields.filter((f) => !manifest[f]);
        const issues = [];
        if (missingFields.length > 0) {
          issues.push({ message: `Missing required fields: ${missingFields.join(', ')}`, path: [] });
        }
        const validTypes = ['agent', 'skill'];
        if (manifest.type && !validTypes.includes(manifest.type)) {
          issues.push({ message: `Invalid type "${manifest.type}". Expected one of: ${validTypes.join(', ')}`, path: [] });
        }
        const skillMdPath = path.join(path.dirname(manifestPath), 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) {
          issues.push({ message: 'Missing SKILL.md file alongside manifest', path: [] });
        }
        if (issues.length > 0) {
          errors.push({ file: relativePath, issues });
        } else {
          console.log(`✅ ${relativePath}`);
        }
      } catch (error) {
        errors.push({ file: relativePath, issues: [{ message: `Failed to parse YAML: ${error.message}`, path: [] }] });
      }
    }
  }

  // Report errors
  if (errors.length > 0) {
    console.log('\n❌ Validation failed for the following files:\n');

    for (const { file, issues } of errors) {
      console.log(`\n📄 ${file}`);
      for (const issue of issues) {
        const pathString = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        console.log(`   Path: ${pathString}`);
        console.log(`   Error: ${issue.message}`);
        if (issue.code) {
          console.log(`   Code: ${issue.code}`);
        }
      }
    }

    console.log(`\n\n💥 ${errors.length} file(s) failed validation`);
    process.exit(1);
  }

  const totalCount = agentFiles.length + skillManifests.length;
  console.log(`\n✨ All ${totalCount} agent file(s) passed validation!\n`);
  process.exit(0);
}

// Run with optional command-line argument for project root
const customProjectRoot = process.argv[2];
main(customProjectRoot).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
