# Confirmed requirements: stub skill answer

The skill runner must write the one scaffold file the prompt names and exit 0. The scaffold carries the workflow's own red-phase call, `test.skip(`. A run that writes nothing, or that exits non-zero, is an environment failure. The evaluation may read the written file and the exit code. The target runs in a disposable copy with no network access.

Confirmed by: fixture adopter, 2026-10-01.
