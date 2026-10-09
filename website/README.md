# TEA documentation website

The site uses Astro and Starlight.
Edit documentation in `../docs/`; `src/content/docs` points to that directory.

## Develop

From the repository root:

```bash
npm ci
cd website
npm install
npm run dev
```

Open <http://localhost:4321>.
Custom styles live in `src/styles/custom.css`, components in `src/components/`, and navigation in `astro.config.mjs`.

## Build and preview

For the full documentation build, run this from the repository root:

```bash
npm run docs:build
```

The build validates links, generates LLM files and download bundles in `build/artifacts/`, and builds the site in `build/site/`.
Generated files are copied into the site for deployment.

To build or preview the site alone, run these from `website/`:

```bash
npm run build
npm run preview
```

Site-only builds omit the artifact-generation step.
The docs deployment workflow runs the full build.

## Site URL

`SITE_URL` overrides the base URL.
Without it, `GITHUB_REPOSITORY` supplies the GitHub Pages URL; local builds use `http://localhost:3000` as their URL metadata.
The development server runs on port 4321.
For a custom domain:

```bash
SITE_URL=https://example.com/docs npm run build
```

## Documentation layout

- `tutorials/` contains guided walkthroughs.
- `how-to/` contains task instructions.
- `explanation/` covers concepts and architecture.
- `reference/` contains commands, configuration, and contracts.
- `glossary/` defines terms.

The published site is at [TEA Documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/).
