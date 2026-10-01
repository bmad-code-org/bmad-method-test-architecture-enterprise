# Confirmed requirements: grader HTTP service

Under the committed strict policy the grader service must accept the answer it is asked to grade. The evaluation may read the HTTP status and the parsed response body. Only requests to the loopback grading endpoint are in scope.

Confirmed by: fixture adopter, 2026-10-01.
