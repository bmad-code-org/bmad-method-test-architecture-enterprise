/** Check the built documentation's consolidated guides at desktop and mobile widths. */
'use strict';

/* global document, window */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..', 'build', 'site');
const guides = [
  ['/how-to/workflows/run-automate/', '1. Run Automate in Red Mode', '5. Verify Red-Phase Scaffolds'],
  ['/how-to/workflows/setup-test-framework/', '1. Run CI Setup', '4. Review Generated CI Configuration'],
];
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };

async function main() {
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Run npm run docs:build before checking layout.');
  const { getSiteUrl } = await import('../website/src/lib/site-url.js');
  const sitePath = new URL(getSiteUrl()).pathname;
  const basePath = sitePath.endsWith('/') ? sitePath : sitePath + '/';
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!requestPath.startsWith(basePath)) {
      response.writeHead(404).end();
      return;
    }
    let file = path.resolve(root, requestPath.slice(basePath.length));
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = origin + basePath;
    const requestFailures = [];
    const isLocal = (requestUrl) => new URL(requestUrl).origin === origin;
    page.on('requestfailed', (request) => {
      if (isLocal(request.url())) requestFailures.push(`${request.resourceType()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on('response', (response) => {
      if (isLocal(response.url()) && !response.ok()) {
        requestFailures.push(`${response.request().resourceType()} ${response.url()}: HTTP ${response.status()}`);
      }
    });
    page.on('pageerror', (error) => requestFailures.push(`script error: ${error.message}`));
    for (const width of [1153, 1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, first, last] of guides) {
        await page.goto(url + route.slice(1));
        assert.deepEqual(requestFailures, [], `${route} failed local stylesheets, scripts, or requests at ${width}px`);
        const desktop = width >= 1152;
        const toc = page.locator(desktop ? '.right-sidebar starlight-toc' : 'mobile-starlight-toc');
        assert.equal(await toc.count(), 1, `${route} TOC at ${width}px`);
        const links = toc.getByRole('link', { includeHidden: true });
        for (const step of [first, last]) {
          const link = links.filter({ hasText: step });
          assert.equal(await link.count(), 1, `${route} numbered step ${step} at ${width}px`);
          const fragment = (await link.getAttribute('href')).split('#')[1];
          assert.equal(await page.locator(`[id="${fragment}"]`).count(), 1, `${route} step target ${fragment}`);
        }
        const measurements = await page.evaluate(() => {
          const bounds = (element) => {
            const box = element.getBoundingClientRect();
            return { left: box.left, right: box.right };
          };
          return {
            width: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            toc: [...document.querySelectorAll('.right-sidebar starlight-toc')].map(bounds),
            links: [...document.querySelectorAll('.right-sidebar starlight-toc a')].map(bounds),
          };
        });
        assert.ok(measurements.scrollWidth <= width, `${route} page overflow at ${width}px: ${JSON.stringify(measurements)}`);
        if (desktop) {
          assert.ok(measurements.links.length > 0, `${route} desktop step links rendered`);
          for (const box of [...measurements.toc, ...measurements.links]) {
            assert.ok(box.left >= 0 && box.right <= width + 1, `${route} TOC clipped at ${width}px: ${JSON.stringify(box)}`);
          }
        }
      }
    }
    assert.deepEqual(requestFailures, [], 'Documentation assets and scripts completed without local failures.');
    console.log(
      'Documentation layout: Automate and Framework TOCs, numbered steps, and viewport bounds passed at 1153px, 1440px, and 390px.',
    );
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
