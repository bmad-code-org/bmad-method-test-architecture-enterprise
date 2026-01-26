/**
 * Path Verification Script for TEA Module Migration
 *
 * This script searches for any remaining BMM module references
 * that should have been replaced with TEA module references.
 *
 * Usage: node tools/verify-paths.js
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// Color codes for terminal output
const RED = '\u001B[31m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const RESET = '\u001B[0m';

let issuesFound = 0;

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function checkPattern(description, command) {
  log(`\n🔍 Checking: ${description}`, YELLOW);

  try {
    const result = execSync(command, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.trim()) {
      log(`❌ FOUND ISSUES:`, RED);
      console.log(result);
      issuesFound++;
      return false;
    } else {
      log(`✅ No issues found`, GREEN);
      return true;
    }
  } catch (error) {
    // grep returns exit code 1 when no matches found (this is success for us)
    if (error.status === 1) {
      log(`✅ No issues found`, GREEN);
      return true;
    }
    log(`⚠️  Error running check: ${error.message}`, RED);
    return false;
  }
}

log('═══════════════════════════════════════════════════════════', GREEN);
log('   TEA Module Migration - Path Verification Script', GREEN);
log('═══════════════════════════════════════════════════════════', GREEN);

// Check 1: Absolute BMM path references
checkPattern('Absolute BMM path references (/_bmad/bmm/)', 'grep -r "/_bmad/bmm/" src/ || true');

// Check 2: Relative BMM path references
checkPattern('Relative BMM path references (_bmad/bmm/)', 'grep -r "_bmad/bmm/" src/ | grep -v "/_bmad/bmm/" || true');

// Check 3: Alternative BMM path references
checkPattern('Alternative BMM path references (bmad/bmm/)', 'grep -r "bmad/bmm/" src/ | grep -v "_bmad/bmm/" || true');

// Check 4: Module references in YAML
checkPattern('Module references (module: bmm)', 'grep -r "module: bmm" src/ || true');

// Check 5: Command namespace in docs
checkPattern('BMM command namespace in docs (/bmad:bmm:)', 'grep -r "/bmad:bmm:" docs/ || true');

// Check 6: CSV files
checkPattern('BMM references in CSV files', String.raw`find src/ -name "*.csv" -exec grep -l "bmm" {} \; || true`);

// Check 7: Verify TEA paths are present
log(`\n🔍 Checking: TEA paths are correctly used`, YELLOW);
const teaCount = execSync('grep -r "_bmad/tea/" src/ | wc -l', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

if (parseInt(teaCount) > 0) {
  log(`✅ Found ${teaCount} TEA path references (expected)`, GREEN);
} else {
  log(`❌ No TEA path references found (unexpected)`, RED);
  issuesFound++;
}

// Summary
log('\n═══════════════════════════════════════════════════════════', GREEN);
if (issuesFound === 0) {
  log('✅ ALL CHECKS PASSED - No BMM references found', GREEN);
  log('✅ Path migration verification successful!', GREEN);
  process.exit(0);
} else {
  log(`❌ VERIFICATION FAILED - ${issuesFound} issue(s) found`, RED);
  log('Please review the output above and fix the issues', RED);
  process.exit(1);
}
