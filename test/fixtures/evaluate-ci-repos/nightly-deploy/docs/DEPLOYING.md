# Deploying

`.github/workflows/deploy.yml` deploys `main` to production every night at 03:47 UTC, after `.github/workflows/nightly.yml` has run at 02:17 UTC.
The two workflows are independent, so a failed nightly run does not stop that night's deploy.

A grading defect reaches learners at the next deploy, within 24 hours, and the grade decides whether a learner passes a course.
Roll back by re-running the deploy workflow on the previous commit.
