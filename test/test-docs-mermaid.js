/**
 * Every Mermaid diagram in the docs reaches the reader as a diagram, not as source code.
 *
 * Starlight prints a ```mermaid fence as a `<pre data-language="mermaid">` block of raw source unless a renderer is
 * wired. The `astro-mermaid` integration turns each fence into `<pre class="mermaid">` at build time and injects one
 * page script that renders those blocks in the reader's browser, so the build needs no headless browser.
 *
 * This test builds the site into a temporary folder and, for every page whose source holds a mermaid fence, proves that
 *  - no raw `<pre data-language="mermaid">` block is left,
 *  - the page holds one `<pre class="mermaid">` container per fence, and
 *  - the page loads a script that finds `pre.mermaid` and imports the mermaid library chunk, and that chunk is in the build.
 *
 * Revert cases keep the check honest. Each one damages a copy of a built page, or the site config, and the check must go red:
 * a raw block put back, the container class removed, the script tag removed, a script that never imports mermaid, a fence
 * count that no longer matches, and a real second build with the `mermaid(...)` integration removed from the config.
 *
 * Usage: node test/test-docs-mermaid.js
 */

'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const WEBSITE_ROOT = path.join(PROJECT_ROOT, 'website');
const CONFIG_FILE = path.join(WEBSITE_ROOT, 'astro.config.mjs');
const ASTRO_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'astro');

/** How many ```mermaid (or ~~~mermaid) fences a page's Markdown source holds. */
function countFences(markdown) {
  return (markdown.match(/^[ \t]*(?:`{3,}|~{3,})mermaid[ \t]*$/gm) ?? []).length;
}

/** The pages under docs/ that hold at least one mermaid fence, as `{ page, fences }`, sorted. Pages the site never serves (an underscore part) are skipped. */
function pagesWithFences(root = DOCS_ROOT) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith('_')) continue;
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.md')) {
        const fences = countFences(fs.readFileSync(full, 'utf8'));
        if (fences > 0) found.push({ page: path.relative(root, full).split(path.sep).join('/'), fences });
      }
    }
  };
  visit(root);
  return found.sort((a, b) => (a.page < b.page ? -1 : 1));
}

/** The built file Starlight writes for a docs page. */
function builtFileFor(page) {
  const slug = page.replace(/\.md$/, '');
  return slug === 'index' || slug.endsWith('/index') ? `${slug}.html` : `${slug}/index.html`;
}

/**
 * What is wrong with one built page that holds `fences` mermaid fences. `readAsset` reads a file of the built site by its
 * path under `_astro/` and returns null when the file is missing.
 */
function mermaidProblems(html, fences, readAsset) {
  const problems = [];
  if (/<pre\b[^>]*\bdata-language="mermaid"/.test(html)) problems.push('a raw <pre data-language="mermaid"> block is left');

  const containers = (html.match(/<pre\b[^>]*\bclass="mermaid"/g) ?? []).length;
  if (containers !== fences) problems.push(`${containers} <pre class="mermaid"> containers for ${fences} fences`);

  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="[^"]*\/_astro\/(page\.[^"/]+\.js)"/g)].map((match) => match[1]);
  if (scripts.length === 0) {
    problems.push('the page loads no /_astro/page.*.js script');
    return problems;
  }
  const renderer = scripts
    .map((name) => ({ name, source: readAsset(name) }))
    .find(({ source }) => source !== null && source.includes('pre.mermaid'));
  if (!renderer) {
    problems.push('no page script looks for pre.mermaid');
    return problems;
  }
  const chunk = /import\("\.\/(mermaid[^"/]*\.js)"\)/.exec(renderer.source);
  if (!chunk) problems.push(`${renderer.name} never imports the mermaid library chunk`);
  else if (readAsset(chunk[1]) === null) problems.push(`the mermaid library chunk ${chunk[1]} is not in the build`);
  return problems;
}

/** Builds the site into `outDir` with the config at `configFile`; returns the build's exit status and output. */
function buildSite(outDir, configFile = CONFIG_FILE) {
  // build-docs.js clears this cache first: the content folder links to docs/, and stale entries register a page twice.
  fs.rmSync(path.join(WEBSITE_ROOT, 'node_modules', '.astro'), { recursive: true, force: true });
  const result = spawnSync(
    ASTRO_BIN,
    ['build', '--root', WEBSITE_ROOT, '--config', path.relative(WEBSITE_ROOT, configFile), '--outDir', outDir],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, SITE_URL: 'http://localhost:3000' },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Every problem on every fenced page of a site built at `outDir`, as `page: problem` lines. */
function siteProblems(outDir, pages) {
  const readAsset = (name) => {
    const file = path.join(outDir, '_astro', name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
  const lines = [];
  for (const { page, fences } of pages) {
    const file = path.join(outDir, builtFileFor(page));
    if (!fs.existsSync(file)) {
      lines.push(`${page}: no built page at ${builtFileFor(page)}`);
      continue;
    }
    for (const problem of mermaidProblems(fs.readFileSync(file, 'utf8'), fences, readAsset)) lines.push(`${page}: ${problem}`);
  }
  return lines;
}

function main() {
  const pages = pagesWithFences();
  assert.ok(pages.length >= 8, `the docs hold mermaid fences to check (found ${pages.length})`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-mermaid-'));
  const brokenConfig = path.join(WEBSITE_ROOT, 'astro.config.no-mermaid.mjs');
  try {
    // The real site: every fenced page is wired.
    const site = path.join(scratch, 'site');
    const built = buildSite(site);
    assert.equal(built.status, 0, `the site build failed:\n${built.output.slice(-2000)}`);
    const problems = siteProblems(site, pages);
    assert.deepEqual(problems, [], `mermaid fences that do not reach the reader as diagrams:\n${problems.join('\n')}`);

    // Revert cases on a copy of one built page and its assets.
    const sample = pages[0];
    const html = fs.readFileSync(path.join(site, builtFileFor(sample.page)), 'utf8');
    const readAsset = (name) => {
      const file = path.join(site, '_astro', name);
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    };
    assert.deepEqual(mermaidProblems(html, sample.fences, readAsset), [], 'the unmodified sample page passes');

    const reverts = [
      [
        'a raw block put back',
        html.replace('<pre class="mermaid"', '<pre data-language="mermaid"'),
        sample.fences,
        readAsset,
        /raw <pre data-language/,
      ],
      ['the container class removed', html.replaceAll('class="mermaid"', 'class="diagram"'), sample.fences, readAsset, /containers for/],
      [
        'the page script removed',
        html.replaceAll(/<script\b[^>]*\/_astro\/page\.[^>]*><\/script>/g, ''),
        sample.fences,
        readAsset,
        /no \/_astro\/page/,
      ],
      [
        'a script that never imports mermaid',
        html,
        sample.fences,
        (name) => (readAsset(name) === null ? null : 'pre.mermaid'),
        /never imports/,
      ],
      ['a page script that does not look for diagrams', html, sample.fences, () => 'nothing', /no page script looks/],
      [
        'a library chunk missing from the build',
        html,
        sample.fences,
        (name) => (name.startsWith('mermaid') ? null : readAsset(name)),
        /not in the build/,
      ],
      ['a fence count that no longer matches', html, sample.fences + 1, readAsset, /containers for/],
    ];
    for (const [name, mutated, fences, read, expected] of reverts) {
      assert.notEqual(mutated, undefined);
      const found = mermaidProblems(mutated, fences, read).join('\n');
      assert.match(found, expected, `revert case "${name}" must fail the check`);
    }
    assert.notEqual(html.replace('<pre class="mermaid"', '<pre data-language="mermaid"'), html, 'the raw-block revert changes the page');

    // The real revert: build again with the integration removed from the config. The raw blocks must come back and the check must go red.
    const config = fs.readFileSync(CONFIG_FILE, 'utf8');
    const without = config.replace(/^[ \t]*mermaid\(\{[^\n]*\}\),\n/m, '');
    assert.notEqual(without, config, 'the config holds a one-line mermaid({ ... }), integration to remove');
    fs.writeFileSync(brokenConfig, without);
    const brokenSite = path.join(scratch, 'broken-site');
    const brokenBuild = buildSite(brokenSite, brokenConfig);
    assert.equal(brokenBuild.status, 0, `the build without mermaid failed:\n${brokenBuild.output.slice(-2000)}`);
    const brokenProblems = siteProblems(brokenSite, pages);
    assert.ok(
      brokenProblems.length >= pages.length,
      `the site built without the integration must fail every fenced page (got ${brokenProblems.length})`,
    );
    assert.ok(
      brokenProblems.every(
        (line) =>
          /raw <pre data-language="mermaid">/.test(line) || /containers for/.test(line) || /no \/_astro\/page|no page script/.test(line),
      ),
      `the broken build fails for the expected reasons:\n${brokenProblems.join('\n')}`,
    );

    console.log(
      `test-docs-mermaid: ${pages.length} pages with ${pages.reduce((sum, { fences }) => sum + fences, 0)} diagrams render through astro-mermaid`,
    );
  } finally {
    fs.rmSync(brokenConfig, { force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(path.join(WEBSITE_ROOT, 'node_modules', '.astro'), { recursive: true, force: true });
  }
}

main();
