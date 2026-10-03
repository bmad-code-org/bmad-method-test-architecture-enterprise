# Confirmed requirements: verdict command

Under the committed strict policy the verdict command must accept every request it is given, say `verdict: accepted` on stdout and exit 0. The evaluation may read stdout and the exit code. The target runs in a disposable copy of the repository with no network access.

The shared request, the development case and the held-out case are three requests of one kind. The development case is for authoring and may be read by anyone who tunes the evaluation. The held-out case is sealed with the held-out partition.

Confirmed by: fixture adopter, 2026-10-03.
