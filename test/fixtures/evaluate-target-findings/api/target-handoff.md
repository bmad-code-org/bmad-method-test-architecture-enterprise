# Target handoff: grader-http-service

The evaluation found these target improvements and the adopter chose a separate pull request for them.
The next evaluation of the service measures each one against the accepted baseline with `tea-evaluate compare`.

## T-001: the first grade response fails validation

- **Target:** `server/grader.js`.
- **Evidence:** run `20261125T100000000Z-0a1b2c3d`, score `20261125T100100000Z-0a1b2c3d`, probe P-001 trial 1, interpretation finding F-001 under `process`.
- **Proposed change:** validate the `answer` query parameter before grading, so the first response is the graded one.
- **Measured by:** P-001, whose interpretation should list no process finding after the change.
