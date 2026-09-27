# Confirmed requirements: stub skill answer

The skill runner must pass the requested skill root and prompt to the stub agent. A successful answer names `stub-skill` on stdout and exits with code 0. The evaluation may read stdout and the exit code. The target runs in a disposable copy with a one minute ceiling and no network access.

Confirmed by: fixture adopter, 2026-09-27.
