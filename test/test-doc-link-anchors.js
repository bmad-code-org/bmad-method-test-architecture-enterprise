/** Exercise explicit anchor handling through the documentation validator CLI. */
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-doc-link-anchors-'));
const docs = path.join(root, 'docs');
const validator = path.join(root, 'tools', 'validate-doc-links.js');
const cases = [
  ['ordinary heading', '# Target\n', 'target', 0],
  ['explicit compatibility anchor', '<a id="old-section"></a>\n', 'old-section', 0],
  ['class before id', '<a class="compatibility" id="old-section"></a>\n', 'old-section', 0],
  ['quoted greater-than before id', '<a title="old > new" id="old-section"></a>\n', 'old-section', 0],
  ['attribute value resembling id', '<a title="id=ghost"></a>\n', 'ghost', 1],
  ['single quoted id', "<a class='compatibility' id='old-section'></a>\n", 'old-section', 0],
  ['unquoted id', '<a class="compatibility" id=old-section></a>\n', 'old-section', 0],
  ['backtick fence', '```html\n<a id="old-section"></a>\n```\n', 'old-section', 1],
  ['tilde fence', '~~~html\n<a id="old-section"></a>\n~~~\n', 'old-section', 1],
  ['inline code', '`<a id="old-section"></a>`\n', 'old-section', 1],
  ['HTML comment', '<!--\n<a id="old-section"></a>\n-->\n', 'old-section', 1],
];

try {
  fs.mkdirSync(docs);
  fs.mkdirSync(path.dirname(validator));
  fs.copyFileSync(path.join(projectRoot, 'tools', 'validate-doc-links.js'), validator);
  fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const [label, target, fragment, expected] of cases) {
    fs.writeFileSync(path.join(docs, 'target.md'), target);
    fs.writeFileSync(path.join(docs, 'index.md'), `[Target](./target.md#${fragment})\n`);
    const result = spawnSync(process.execPath, [validator], { encoding: 'utf8' });
    assert.equal(result.status, expected, `${label}: ${result.stdout}\n${result.stderr}`);
    if (expected === 1) assert.match(result.stdout, /broken|not found/i, label);
  }
  console.log(`Documentation anchor CLI fixtures: ${cases.length} passed.`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
