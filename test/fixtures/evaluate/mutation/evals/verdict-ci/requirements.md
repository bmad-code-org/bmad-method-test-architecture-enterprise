# Confirmed requirements: verdict command

Under the committed strict policy the verdict command must accept the request it is given, say `verdict: accepted` on stdout and exit 0. The evaluation may read stdout and the exit code. The target runs in a disposable copy of the repository with no network access.

Confirmed by: fixture adopter, 2026-10-01.
