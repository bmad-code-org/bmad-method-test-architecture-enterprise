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
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        'vi-vn': {
          label: 'Tiếng Việt',
          lang: 'vi-VN',
        },
      },

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
        {
          label: 'Welcome',
          translations: { 'vi-VN': 'Chào mừng' },
          slug: 'index',
        },
        {
          label: 'TEA Overview',
          translations: { 'vi-VN': 'Tổng quan TEA' },
          slug: 'explanation/tea-overview',
        },
        {
          label: 'Tutorials',
          translations: { 'vi-VN': 'Hướng dẫn học' },
          collapsed: false,
          autogenerate: { directory: 'tutorials' },
        },
        {
          label: 'How-To Guides',
          translations: { 'vi-VN': 'Hướng dẫn thực hiện' },
          collapsed: true,
          items: [
            {
              label: 'Workflows',
              translations: { 'vi-VN': 'Workflows' },
              items: [
                {
                  label: 'Teach Me Testing',
                  translations: { 'vi-VN': 'Học kiểm thử' },
                  slug: 'how-to/workflows/teach-me-testing',
                },
                {
                  label: 'Set Up Test Framework',
                  translations: { 'vi-VN': 'Thiết lập test framework' },
                  slug: 'how-to/workflows/setup-test-framework',
                },
                {
                  label: 'Set Up CI Pipeline',
                  translations: { 'vi-VN': 'Thiết lập CI pipeline' },
                  slug: 'how-to/workflows/setup-ci',
                },
                {
                  label: 'Test Design',
                  translations: { 'vi-VN': 'Thiết kế kiểm thử' },
                  slug: 'how-to/workflows/run-test-design',
                },
                { label: 'ATDD', slug: 'how-to/workflows/run-atdd' },
                {
                  label: 'Automate',
                  translations: { 'vi-VN': 'Tự động hóa' },
                  slug: 'how-to/workflows/run-automate',
                },
                {
                  label: 'Test Review',
                  translations: { 'vi-VN': 'Đánh giá test' },
                  slug: 'how-to/workflows/run-test-review',
                },
                {
                  label: 'Trace',
                  translations: { 'vi-VN': 'Truy vết' },
                  slug: 'how-to/workflows/run-trace',
                },
                {
                  label: 'NFR Assessment',
                  translations: { 'vi-VN': 'Đánh giá NFR' },
                  slug: 'how-to/workflows/run-nfr-assess',
                },
              ],
            },
            {
              label: 'Customization',
              translations: { 'vi-VN': 'Tùy biến' },
              autogenerate: { directory: 'how-to/customization' },
            },
            {
              label: 'Brownfield Projects',
              translations: { 'vi-VN': 'Dự án brownfield' },
              autogenerate: { directory: 'how-to/brownfield' },
            },
          ],
        },
        {
          label: 'Explanation',
          translations: { 'vi-VN': 'Giải thích' },
          collapsed: true,
          items: [
            {
              label: 'Testing as Engineering',
              translations: { 'vi-VN': 'Testing as Engineering' },
              slug: 'explanation/testing-as-engineering',
            },
            {
              label: 'Engagement Models',
              translations: { 'vi-VN': 'Mô hình engagement' },
              slug: 'explanation/engagement-models',
            },
            {
              label: 'Risk-Based Testing',
              translations: { 'vi-VN': 'Kiểm thử dựa trên rủi ro' },
              slug: 'explanation/risk-based-testing',
            },
            {
              label: 'Test Quality Standards',
              translations: { 'vi-VN': 'Tiêu chuẩn chất lượng test' },
              slug: 'explanation/test-quality-standards',
            },
            {
              label: 'Knowledge Base System',
              translations: { 'vi-VN': 'Hệ thống knowledge base' },
              slug: 'explanation/knowledge-base-system',
            },
            {
              label: 'Network-First Patterns',
              translations: { 'vi-VN': 'Pattern network-first' },
              slug: 'explanation/network-first-patterns',
            },
            {
              label: 'Fixture Architecture',
              translations: { 'vi-VN': 'Kiến trúc fixture' },
              slug: 'explanation/fixture-architecture',
            },
            {
              label: 'Step-File Architecture',
              translations: { 'vi-VN': 'Kiến trúc step-file' },
              slug: 'explanation/step-file-architecture',
            },
            {
              label: 'Subagent Architecture',
              translations: { 'vi-VN': 'Kiến trúc subagent' },
              slug: 'explanation/subagent-architecture',
            },
          ],
        },
        {
          label: 'Reference',
          translations: { 'vi-VN': 'Tham chiếu' },
          collapsed: true,
          items: [
            {
              label: 'Commands',
              translations: { 'vi-VN': 'Lệnh' },
              slug: 'reference/commands',
            },
            {
              label: 'Configuration',
              translations: { 'vi-VN': 'Cấu hình' },
              slug: 'reference/configuration',
            },
            {
              label: 'Knowledge Base',
              translations: { 'vi-VN': 'Knowledge Base' },
              slug: 'reference/knowledge-base',
            },
            {
              label: 'Troubleshooting',
              translations: { 'vi-VN': 'Khắc phục sự cố' },
              slug: 'reference/troubleshooting',
            },
          ],
        },
        {
          label: 'Glossary',
          translations: { 'vi-VN': 'Thuật ngữ' },
          slug: 'glossary',
        },
        {
          label: 'BMad Ecosystem',
          translations: { 'vi-VN': 'Hệ sinh thái BMad' },
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
