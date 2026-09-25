# TEA Documentation Website

This directory contains the Astro + Starlight website for Test Architect (TEA) documentation.

## Setup

Install dependencies:

```bash
cd website
npm install
```

## Development

Run the development server:

```bash
npm run dev
```

Visit <http://localhost:4321> to view the site.

## Build

Build the production site:

```bash
npm run build
```

Output is generated to `../build/site/` (configured in `astro.config.mjs`).

## Preview

Preview the production build locally:

```bash
npm run preview
```

## Structure

```text
website/
├── astro.config.mjs      # Astro configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript configuration
├── public/               # Static assets
│   ├── favicon.ico
│   ├── robots.txt
│   └── img/              # Images and logos
├── src/
│   ├── components/       # Astro components
│   │   ├── Banner.astro
│   │   ├── Header.astro
│   │   └── MobileMenuFooter.astro
│   ├── content/          # Content collections
│   │   └── config.ts
│   ├── lib/              # Utility libraries
│   │   └── site-url.js
│   ├── pages/            # Page templates
│   │   └── 404.astro
│   ├── styles/           # Custom CSS
│   │   └── custom.css
│   ├── rehype-markdown-links.js  # Rehype plugin for markdown links
│   └── rehype-base-paths.js      # Rehype plugin for base paths
```

## Configuration

The site URL is configured via environment variable or defaults:

```bash
# Without SITE_URL, GitHub Actions builds for https://<owner>.github.io/<repo>
# and a local build for http://localhost:3000. Override it for a custom domain:
SITE_URL=https://example.com/docs npm run build
```

## Deployment

The site is built and deployed via the documentation build pipeline:

```bash
# From project root
npm run docs:build
```

This generates:

- `/build/artifacts/` - LLM files, download bundles
- `/build/site/` - Deployable website

## Documentation Structure

Documentation follows the [Diataxis](https://diataxis.fr/) framework:

- **Tutorials**: Learning-oriented, step-by-step guides
- **How-To Guides**: Task-oriented, goal-focused instructions
- **Explanation**: Understanding-oriented, conceptual content
- **Reference**: Information-oriented, technical specifications
- **Glossary**: Terminology and definitions

## Starlight Features

- **Search**: Built-in full-text search
- **Navigation**: Automatic sidebar from file structure
- **Dark Mode**: Automatic light/dark theme switching
- **Mobile-Friendly**: Responsive design
- **LLM Discovery**: Meta tags for AI agent consumption
- **Sitemap**: Automatic sitemap generation
- **Last Updated**: Git-based timestamps

## Customization

### Components

Custom components override Starlight defaults:

- `Header.astro` - Site header
- `MobileMenuFooter.astro` - Mobile menu footer

### Styles

Custom CSS in `src/styles/custom.css` extends Starlight's default theme.

### Sidebar

Sidebar configuration in `astro.config.mjs` controls navigation structure.

## Links

- Documentation: <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/>
- Repository: <https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise>
- BMAD Method: <https://bmad-method.org>
