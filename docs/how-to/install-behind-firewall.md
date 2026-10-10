---
title: 'Install TEA Behind a Corporate Firewall'
description: Install the TEA skills from a local clone or internal mirror when GitHub is blocked
---

# Install TEA Behind a Corporate Firewall

`npx skills add bmad-code-org/bmad-method-test-architecture-enterprise` fetches TEA from GitHub.
If your network blocks GitHub, use a local clone or internal Git mirror.

1. Clone TEA locally, or use your internal Git mirror:

   ```bash
   git clone /path/to/your/internal/mirror/bmad-method-test-architecture-enterprise \
     /path/to/local/bmad-method-test-architecture-enterprise
   ```

2. From your project root, add the skills from that path. `npx skills add` accepts a local path or a Git URL in place of the GitHub name:

   ```bash
   npx skills add /path/to/local/bmad-method-test-architecture-enterprise
   # or: npx skills add https://git.internal.example.com/mirrors/bmad-method-test-architecture-enterprise.git
   ```

   This adds the TEA skills and `bmod-tea`, which holds the setup questions and the knowledge base.

3. Add the `bmad` skill and its module record `bmod-core-tools` from BMad Method core the same way, from a clone or mirror of `BMAD-METHOD`, if the project does not have them:

   ```bash
   npx skills add /path/to/local/BMAD-METHOD --skill bmad bmod-core-tools
   ```

   `bmad setup` runs through [uv](https://docs.astral.sh/uv/) with Python 3.11 or later.
   Install uv from an internal mirror, and make a Python 3.11 interpreter available to it, because uv downloads Python from the internet when none is installed.

4. In your assistant chat, run:

   ```text
   bmad setup tea
   ```

Setup and every TEA skill run locally once the skills are installed.
Updates are the exception: `bmad setup` updates through `npx skills update`, which looks for new versions on GitHub.
To update behind the firewall, pull the new version into your clone or mirror and run step 2 again.

If your environment also blocks npm, use an internal npm proxy so `npx` can fetch the `skills` CLI.
