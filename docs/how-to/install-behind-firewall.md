---
title: 'Install TEA Behind a Corporate Firewall'
description: Point the BMAD installer at a local clone or internal mirror when it cannot reach GitHub
---

# Install TEA Behind a Corporate Firewall

If the BMAD installer runs but cannot fetch the Test Architect module from GitHub, point it at a local clone or an internal Git mirror.

1. Clone TEA locally, or use your internal Git mirror:

   ```bash
   git clone /path/to/your/internal/mirror/bmad-method-test-architecture-enterprise \
     /path/to/local/bmad-method-test-architecture-enterprise
   ```

2. Edit the module list in the BMAD repo you run the installer from, at `BMAD-METHOD/tools/cli/external-official-modules.yaml`, so the TEA entry points at your local path. `url:` accepts a local filesystem path or an internal Git mirror URL:

   ```yaml
   bmad-method-test-architecture-enterprise:
     url: /path/to/local/bmad-method-test-architecture-enterprise
     module-definition: src/module.yaml
     code: tea
     name: 'Test Architect'
     description: 'Master Test Architect for quality strategy, test automation, and release gates'
     defaultSelected: false
     type: bmad-org
     npmPackage: bmad-method-test-architecture-enterprise
   ```

3. Run the installer:

   ```bash
   npx bmad-method install
   ```

If you cannot edit the BMAD repo, pass the same local path on the command line instead. `--custom-source` accepts comma-separated Git URLs or local paths:

```bash
npx bmad-method install --custom-source /path/to/local/bmad-method-test-architecture-enterprise
```

If your environment also blocks npm, use an internal npm proxy, or allow npm only for the local module cache.
