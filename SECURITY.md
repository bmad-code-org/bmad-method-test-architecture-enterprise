# Security policy

## Supported versions

Security patches target the latest stable TEA release.
Update older versions to receive those fixes.

## Report a vulnerability

Do not report security vulnerabilities through public GitHub issues.

Send security reports privately through [BMad's vulnerability reporting form](https://github.com/bmad-code-org/BMAD-METHOD/security/advisories/new) or a maintainer DM in [Discord](https://discord.gg/gk8jAdXWmj).
The private reporting form is hosted by the BMad Method repository.
Include:

- The affected TEA version and source files.
- Steps to reproduce and a proof of concept, if available.
- The impact and any conditions required to trigger the issue.

We aim to acknowledge reports within 48 hours and provide an assessment within seven days.
Resolution targets are 30 days for critical issues and 90 days for other issues.
We investigate the report, coordinate the fix and disclosure, and credit the reporter unless they request anonymity.

## Scope

Reports can cover TEA code, agent definitions, workflows, dependency vulnerabilities, path traversal, and prompt injection that bypasses intended behavior.
Issues in custom user modules or third-party AI providers belong with their maintainers.
Physical access, social engineering, and denial of service without a specific project vulnerability fall outside this policy.

## Using TEA safely

Review generated code before running it and check dependencies it adds.
Keep TEA updated, limit the assistant's file access, and run development tools in an isolated environment where possible.
