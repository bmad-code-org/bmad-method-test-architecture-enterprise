/**
 * Every Mermaid diagram in the docs is spelled so the site converts it, parses, and reaches the reader as a container the
 * renderer script draws.
 *
 * Starlight prints a ```mermaid fence as a `<pre data-language="mermaid">` block of raw source unless a renderer is
 * wired. The `astro-mermaid` integration turns each fence whose language is exactly `mermaid` into `<pre class="mermaid">`
 * at build time and injects one page script that draws those blocks in the reader's browser, so the build needs no headless
 * browser. A fence spelled `Mermaid` is not converted, and a fence whose source does not parse draws Mermaid's "Syntax
 * error" graphic instead of a diagram.
 *
 * What this test proves, for every Markdown page under `docs/`:
 *  - every fence whose language reads `mermaid` in any case is spelled lowercase `mermaid`,
 *  - the source of every such fence parses with Mermaid's own parser (`mermaid.parse`, run in Node through
 *    `test/lib/mermaid-parse.js`).
 *
 * It then builds the site into a temporary folder and proves, for the built pages:
 *  - no built page, fenced or not, holds a raw `<pre data-language="...mermaid...">` block, in any case,
 *  - a page with fences holds one `<pre class="mermaid">` container per fence, and
 *  - such a page loads a script that finds `pre.mermaid` and imports the mermaid library chunk, and that chunk is in the build.
 *
 * It does not draw the diagrams: a parse that succeeds and a script that is wired do not prove the drawing looks right, so
 * layout, size and colour are checked by looking at the rendered pages.
 *
 * Revert cases keep the check honest. Each one damages a copy of a fence, a built page, or the site config, and the check must go red:
 * a syntax error in a fence, a fence spelled `Mermaid`, a raw block put back (including one spelled `Mermaid` on a page with no
 * fence), the container class removed, the script tag removed, a script that never imports mermaid, a fence count that no longer
 * matches, and a real second build with the `mermaid(...)` integration removed from the config.
 *
 * Usage: node test/test-docs-mermaid.js
 */

'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseMermaid } = require('./lib/mermaid-parse');

const PROJECT_ROOT = path.join(__dirname, '..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const WEBSITE_ROOT = path.join(PROJECT_ROOT, 'website');
const CONFIG_FILE = path.join(WEBSITE_ROOT, 'astro.config.mjs');
const ASTRO_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'astro');

const RAW_BLOCK = /<pre\b[^>]*\bdata-language="[^"]*mermaid[^"]*"/i;

/**
 * The fences of a Markdown source whose language reads `mermaid` in any case, as `{ lang, source }`, in order. `lang` is the first
 * word of the info string as written. Fences inside another fenced block are not fences of the page and are skipped.
 * An unclosed fence reads to the end of the source.
 */
function mermaidFences(markdown) {
  const fences = [];
  let open = null;
  for (const line of markdown.split('\n')) {
    const match = /^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/.exec(line);
    if (open === null) {
      if (match) open = { marker: match[1], lang: match[2].trim().split(/\s+/)[0], lines: [] };
    } else if (match && match[1][0] === open.marker[0] && match[1].length >= open.marker.length && match[2].trim() === '') {
      if (/^mermaid$/i.test(open.lang)) fences.push({ lang: open.lang, source: open.lines.join('\n') });
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  if (open !== null && /^mermaid$/i.test(open.lang)) fences.push({ lang: open.lang, source: open.lines.join('\n') });
  return fences;
}

/** What is wrong with the mermaid fences of one Markdown source: a spelling the integration does not convert, or source that does not parse. */
async function fenceProblems(markdown, parseMermaid) {
  const problems = [];
  for (const [index, { lang, source }] of mermaidFences(markdown).entries()) {
    if (lang !== 'mermaid') problems.push(`fence ${index + 1} is spelled \`${lang}\`, and the integration converts only \`mermaid\``);
    try {
      await parseMermaid(source);
    } catch (error) {
      const reason = String(error.message ?? error)
        .split('\n')
        .slice(0, 2)
        .join(' ');
      problems.push(`fence ${index + 1} does not parse: ${reason}`);
    }
  }
  return problems;
}

/** The Markdown pages under docs/ the site serves (no underscore part), as `{ page, markdown }`, sorted. */
function docsPages(root = DOCS_ROOT) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith('_')) continue;
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.md')) {
        found.push({ page: path.relative(root, full).split(path.sep).join('/'), markdown: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  visit(root);
  return found.sort((a, b) => (a.page < b.page ? -1 : 1));
}

/** The built `.html` files under `dir`, as paths relative to `dir`. */
function builtPages(dir, base = dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...builtPages(full, base));
    else if (entry.name.endsWith('.html')) found.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return found;
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
  if (RAW_BLOCK.test(html)) problems.push('a raw <pre data-language="mermaid"> block is left');

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

/**
 * Every problem of a site built at `outDir`, as `page: problem` lines: the fenced pages are checked in full, and every built page,
 * fenced or not, is scanned for a raw mermaid block.
 */
function siteProblems(outDir, pages) {
  const readAsset = (name) => {
    const file = path.join(outDir, '_astro', name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
  const lines = [];
  const fenced = new Set();
  for (const { page, fences } of pages) {
    const built = builtFileFor(page);
    fenced.add(built);
    const file = path.join(outDir, built);
    if (!fs.existsSync(file)) {
      lines.push(`${page}: no built page at ${built}`);
      continue;
    }
    for (const problem of mermaidProblems(fs.readFileSync(file, 'utf8'), fences, readAsset)) lines.push(`${page}: ${problem}`);
  }
  for (const built of builtPages(outDir)) {
    if (!fenced.has(built) && RAW_BLOCK.test(fs.readFileSync(path.join(outDir, built), 'utf8'))) {
      lines.push(`${built}: a raw <pre data-language="mermaid"> block is left on a page with no mermaid fence`);
    }
  }
  return lines;
}

async function main() {
  const docs = docsPages();
  const pages = docs.map(({ page, markdown }) => ({ page, fences: mermaidFences(markdown).length })).filter(({ fences }) => fences > 0);
  assert.ok(pages.length >= 8, `the docs hold mermaid fences to check (found ${pages.length})`);

  // Every fence of every page is spelled for the integration and parses.
  const sourceProblems = [];
  for (const { page, markdown } of docs) {
    for (const problem of await fenceProblems(markdown, parseMermaid)) sourceProblems.push(`${page}: ${problem}`);
  }
  assert.deepEqual(sourceProblems, [], `mermaid fences the site cannot draw:\n${sourceProblems.join('\n')}`);

  // Revert cases on the sources: a syntax error and a capitalised fence must go red, and the unmodified fence stays green.
  const goodFence = '```mermaid\nflowchart TD\n  A --> B\n```\n';
  assert.deepEqual(await fenceProblems(goodFence, parseMermaid), [], 'a well-formed lowercase fence passes');
  const syntaxError = await fenceProblems('```mermaid\nflowchart TD\n  A -->> -->\n```\n', parseMermaid);
  assert.match(syntaxError.join('\n'), /does not parse/, 'a syntax error in a fence must fail the check');
  const capitalised = await fenceProblems(goodFence.replace('```mermaid', '```Mermaid'), parseMermaid);
  assert.match(capitalised.join('\n'), /spelled `Mermaid`/, 'a fence spelled Mermaid must fail the check');
  const shouting = await fenceProblems(goodFence.replace('```mermaid', '~~~MERMAID').replace(/```\n$/, '~~~\n'), parseMermaid);
  assert.match(shouting.join('\n'), /spelled `MERMAID`/, 'a tilde fence spelled MERMAID must fail the check');
  assert.equal(
    mermaidFences('```text\n```mermaid\nnot a fence of the page\n```\n').length,
    0,
    'a fence inside another fenced block is not a fence of the page',
  );

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-mermaid-'));
  // The config imports its helpers by relative path, so the broken copy sits beside the real one under a name no other run or file shares.
  const brokenConfig = path.join(WEBSITE_ROOT, `astro.config.no-mermaid-${process.pid}-${randomBytes(6).toString('hex')}.mjs`);
  let createdBrokenConfig = false;
  try {
    // The real site: every fenced page is wired and no built page holds a raw block.
    const site = path.join(scratch, 'site');
    const built = buildSite(site);
    assert.equal(built.status, 0, `the site build failed:\n${built.output.slice(-2000)}`);
    const problems = siteProblems(site, pages);
    assert.deepEqual(problems, [], `mermaid fences that do not reach the reader as containers:\n${problems.join('\n')}`);

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
      [
        'a raw block spelled Mermaid put back',
        html.replace('<pre class="mermaid"', '<pre data-language="Mermaid"'),
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
      const found = mermaidProblems(mutated, fences, read).join('\n');
      assert.match(found, expected, `revert case "${name}" must fail the check`);
    }
    assert.notEqual(html.replace('<pre class="mermaid"', '<pre data-language="mermaid"'), html, 'the raw-block revert changes the page');

    // A raw block on a page with no fence is found by the scan of every built page.
    const unfenced = path.join(site, '404.html');
    const original = fs.readFileSync(unfenced, 'utf8');
    fs.writeFileSync(unfenced, original.replace('</body>', '<pre data-language="Mermaid"><code>graph TD</code></pre></body>'));
    assert.match(
      siteProblems(site, pages).join('\n'),
      /404\.html: a raw <pre data-language="mermaid"> block is left on a page with no mermaid fence/,
      'a raw block on an unfenced built page must fail the check',
    );
    fs.writeFileSync(unfenced, original);

    // The real revert: build again with the integration removed from the config. The raw blocks must come back and the check must go red.
    const config = fs.readFileSync(CONFIG_FILE, 'utf8');
    const without = config.replace(/^ {4}mermaid\(\{\n[\s\S]*?^ {4}\}\),\n/m, '');
    assert.notEqual(without, config, 'the config holds a mermaid({ ... }), integration to remove');
    // The `wx` flag refuses to replace a file that already exists, so this run can only ever create the file it later removes.
    fs.writeFileSync(brokenConfig, without, { flag: 'wx' });
    createdBrokenConfig = true;
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
      `test-docs-mermaid: ${pages.length} pages with ${pages.reduce((sum, { fences }) => sum + fences, 0)} diagrams parse and reach the renderer`,
    );
  } finally {
    if (createdBrokenConfig) fs.rmSync(brokenConfig, { force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(path.join(WEBSITE_ROOT, 'node_modules', '.astro'), { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
