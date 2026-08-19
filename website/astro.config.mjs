// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import rehypeMarkdownLinks from './src/rehype-markdown-links.js';
import rehypeBasePaths from './src/rehype-base-paths.js';
import { getSiteUrl } from './src/lib/site-url.js';

const siteUrl = getSiteUrl();
const urlParts = new URL(siteUrl);
// Normalize basePath: ensure trailing slash so links can use `${BASE_URL}path`
const basePath = urlParts.pathname === '/' ? '/' : urlParts.pathname.endsWith('/') ? urlParts.pathname : urlParts.pathname + '/';

export default defineConfig({
  site: `${urlParts.origin}${basePath}`,
  base: basePath,
  outDir: '../build/site',

  // Disable aggressive caching in dev mode
  vite: {
    optimizeDeps: {
      force: true, // Always re-bundle dependencies
    },
    server: {
      watch: {
        usePolling: false, // Set to true if file changes aren't detected
      },
    },
  },

  markdown: {
    rehypePlugins: [
      [rehypeMarkdownLinks, { base: basePath }],
      [rehypeBasePaths, { base: basePath }],
    ],
  },

  integrations: [
    sitemap(),
    starlight({
      title: 'Test Architect (TEA)',
      tagline: 'Risk-based test strategy, automation guidance, and release gate decisions for quality-driven development.',

      favicon: '/favicon.ico',

      // Social links
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise',
        },
      ],

      // Show last updated timestamps
      lastUpdated: true,

      // Custom head tags for LLM discovery
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'ai-terms',
            content: `AI-optimized documentation: ${siteUrl}/llms-full.txt (plain text, ~111k tokens, complete TEA reference). Index: ${siteUrl}/llms.txt`,
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'llms-full',
            content: `${siteUrl}/llms-full.txt`,
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'llms',
            content: `${siteUrl}/llms.txt`,
          },
        },
      ],

      // Custom CSS
      customCss: ['./src/styles/custom.css'],

      // Sidebar configuration (Diataxis structure)
      sidebar: [
        { label: 'Welcome', slug: 'index' },
        { label: 'TEA Overview', slug: 'explanation/tea-overview' },
        {
          label: 'Tutorials',
          collapsed: false,
          autogenerate: { directory: 'tutorials' },
        },
        {
          label: 'How-To Guides',
          collapsed: true,
          items: [
            {
              label: 'Workflows',
              items: [
                { label: 'Teach Me Testing', slug: 'how-to/workflows/teach-me-testing' },
                { label: 'Test Design', slug: 'how-to/workflows/run-test-design' },
                { label: 'Set Up Test Framework', slug: 'how-to/workflows/setup-test-framework' },
                { label: 'Set Up CI Pipeline', slug: 'how-to/workflows/setup-ci' },
                { label: 'ATDD', slug: 'how-to/workflows/run-atdd' },
                { label: 'Automate', slug: 'how-to/workflows/run-automate' },
                { label: 'Test Review', slug: 'how-to/workflows/run-test-review' },
                { label: 'NFR Evidence Audit', slug: 'how-to/workflows/run-nfr-assess' },
                { label: 'Trace', slug: 'how-to/workflows/run-trace' },
              ],
            },
            {
              label: 'Customization',
              autogenerate: { directory: 'how-to/customization' },
            },
            {
              label: 'Brownfield Projects',
              autogenerate: { directory: 'how-to/brownfield' },
            },
            { label: 'Install Behind a Firewall', slug: 'how-to/install-behind-firewall' },
          ],
        },
        {
          label: 'Explanation',
          collapsed: true,
          items: [
            { label: 'Testing as Engineering', slug: 'explanation/testing-as-engineering' },
            { label: 'Verification Architecture', slug: 'explanation/verification-architecture' },
            { label: 'Engagement Models', slug: 'explanation/engagement-models' },
            { label: 'Risk-Based Testing', slug: 'explanation/risk-based-testing' },
            { label: 'Test Quality Standards', slug: 'explanation/test-quality-standards' },
            { label: 'Knowledge Base System', slug: 'explanation/knowledge-base-system' },
            { label: 'Network-First Patterns', slug: 'explanation/network-first-patterns' },
            { label: 'Fixture Architecture', slug: 'explanation/fixture-architecture' },
            { label: 'Step Files & Orchestration', slug: 'explanation/step-file-architecture' },
            { label: 'Test Review CLI Architecture', slug: 'explanation/test-review-cli-architecture' },
            { label: 'Eval Quality Roadmap', slug: 'explanation/eval-quality-roadmap' },
          ],
        },
        {
          label: 'Reference',
          collapsed: true,
          items: [
            { label: 'Commands', slug: 'reference/commands' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Execution Targets', slug: 'reference/execution-targets' },
            { label: 'Knowledge Base', slug: 'reference/knowledge-base' },
            { label: 'Live Verification Results', slug: 'reference/live-verification-results' },
            { label: 'tea-test-review CLI', slug: 'reference/tea-test-review-cli' },
            { label: 'Troubleshooting', slug: 'reference/troubleshooting' },
          ],
        },
        {
          label: 'Glossary',
          slug: 'glossary',
        },
        {
          label: 'BMad Ecosystem',
          collapsed: false,
          items: [
            { label: 'BMad Method', link: 'https://docs.bmad-method.org/', attrs: { target: '_blank' } },
            { label: 'BMad Builder', link: 'https://bmad-builder-docs.bmad-method.org/', attrs: { target: '_blank' } },
            { label: 'Creative Intelligence Suite', link: 'https://cis-docs.bmad-method.org/', attrs: { target: '_blank' } },
            { label: 'Game Dev Studio', link: 'https://game-dev-studio-docs.bmad-method.org/', attrs: { target: '_blank' } },
          ],
        },
      ],

      // Credits in footer
      credits: false,

      // Pagination
      pagination: true,

      // Use our docs/404.md instead of Starlight's built-in 404
      disable404Route: true,

      // Custom components
      components: {
        Header: './src/components/Header.astro',
        MobileMenuFooter: './src/components/MobileMenuFooter.astro',
      },

      // Table of contents
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
