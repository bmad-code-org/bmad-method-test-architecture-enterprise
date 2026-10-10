// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import mermaid from 'astro-mermaid';
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
    build: {
      // Mermaid's own chunks (diagram parsers, the renderer) run 400 to 700 kB each. A page loads them on
      // demand, and only when it holds a diagram, so they are not part of any page's first load.
      chunkSizeWarningLimit: 800,
    },
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
    // Renders ```mermaid fences in the reader's browser, so the build needs no headless browser.
    // It must come before starlight(): Starlight's code renderer would otherwise claim the fence
    // first and print it as raw source. The docs draw their diagrams with light fills and black
    // text (several open with a `%%{init: {'theme':'base', ...}}%%` directive for GitHub), so
    // every diagram renders in mermaid's light theme and sits on a light card in both site
    // themes (see custom.css). A dark diagram theme would put light text on those pale fills.
    mermaid({
      autoTheme: false,
      theme: 'default',
      enableLog: false,
      // Draw every diagram at its natural width. custom.css keeps that width, so a diagram wider than
      // the column scrolls inside its card instead of shrinking below a readable size.
      mermaidConfig: Object.fromEntries(
        [
          'flowchart',
          'sequence',
          'gantt',
          'journey',
          'class',
          'state',
          'er',
          'pie',
          'requirement',
          'mindmap',
          'timeline',
          'gitGraph',
          'c4',
          'sankey',
          'xyChart',
          'block',
          'quadrantChart',
          'architecture',
        ].map((diagram) => [diagram, { useMaxWidth: false }]),
      ),
    }),
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
            content: `AI-optimized documentation: ${siteUrl}/llms-full.txt (plain text, complete TEA reference). Index: ${siteUrl}/llms.txt`,
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
              label: 'Skills',
              items: [
                { label: 'Automate', slug: 'how-to/workflows/run-automate' },
                { label: 'Test Review', slug: 'how-to/workflows/run-test-review' },
                { label: 'Test Design', slug: 'how-to/workflows/run-test-design' },
                { label: 'Framework', slug: 'how-to/workflows/setup-test-framework' },
                { label: 'NFR', slug: 'how-to/workflows/run-nfr-assess' },
                { label: 'Trace', slug: 'how-to/workflows/run-trace' },
                { label: 'Teach Me Testing', slug: 'how-to/workflows/teach-me-testing' },
              ],
            },
            {
              label: 'Evaluate',
              items: [
                { label: 'Evaluate a Skill or Agent', slug: 'how-to/evaluate/evaluate-a-skill-or-agent' },
                { label: 'Evaluate an MCP Tool Server', slug: 'how-to/evaluate/evaluate-an-mcp-tool-server' },
                { label: 'Evaluate an HTTP API', slug: 'how-to/evaluate/evaluate-an-http-api' },
                { label: 'Choose an Evaluator and Calibrate a Judge', slug: 'how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge' },
                { label: 'Read the Gaps and Fix Them', slug: 'how-to/evaluate/read-the-gaps-and-fix-them' },
                { label: 'Compare Runs and Accept a Baseline', slug: 'how-to/evaluate/compare-runs-and-accept-a-baseline' },
                { label: 'Put an Evaluation in CI', slug: 'how-to/evaluate/put-an-evaluation-in-ci' },
                { label: 'Bring an Existing Suite', slug: 'how-to/evaluate/bring-an-existing-suite' },
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
            { label: 'How TEA Is Tested', slug: 'explanation/how-tea-is-tested' },
            { label: 'How Evaluate Works', slug: 'explanation/how-evaluate-works' },
            { label: 'Why Evaluate Confines the Target', slug: 'explanation/why-evaluate-confines-the-target' },
            { label: 'Engagement Models', slug: 'explanation/engagement-models' },
            { label: 'Risk-Based Testing', slug: 'explanation/risk-based-testing' },
            { label: 'Test Quality Standards', slug: 'explanation/test-quality-standards' },
            { label: 'Knowledge Base System', slug: 'explanation/knowledge-base-system' },
            { label: 'Network-First Patterns', slug: 'explanation/network-first-patterns' },
            { label: 'Fixture Architecture', slug: 'explanation/fixture-architecture' },
            { label: 'Step Files & Orchestration', slug: 'explanation/step-file-architecture' },
            { label: 'Test Review CLI Architecture', slug: 'explanation/test-review-cli-architecture' },
          ],
        },
        {
          label: 'Reference',
          collapsed: true,
          items: [
            { label: 'Skills & Commands', slug: 'reference/commands' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Execution Targets', slug: 'reference/execution-targets' },
            { label: 'Knowledge Base', slug: 'reference/knowledge-base' },
            { label: 'Live Verification Results', slug: 'reference/live-verification-results' },
            { label: 'tea-evaluate CLI', slug: 'reference/tea-evaluate-cli' },
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
