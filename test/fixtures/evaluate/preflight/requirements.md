# Confirmed requirements: stub skill preflight

The skill runner must hand the agent the skill it was given and the request, and the run must exit 0. The evaluation may read stdout and the exit code. The target runs in a disposable copy with no network access.

Confirmed by: fixture adopter, 2026-10-01.
