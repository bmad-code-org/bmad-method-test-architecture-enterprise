# Evaluate assets

Templates an authored evaluation starts from.
The scoring policy and evaluator conditions JSON templates leave adopter choices `null`, so a copy validates only once those are filled.
The one exception is the scoring-policy template's `parentDigest: null`, which is already its final value: a new policy has no parent.

- `evaluation.json` is a schema-valid worked starter for a reservation-review skill.
  Replace its target, launch and registry paths using the inspection record before running `tea-evaluate check`.
  Its `requirements.digest` matches the exact bytes of `requirements-statement.md`; recalculate it with eval-quality's `digestBytes` after filling the statement and copying it to `requirements.md`.
- `inspection-record.md` is copied to a run-specific working draft and captures the target's entry points, behaviors, surfaces, existing tests and failure history without recording a second target-kind field.
- `requirements-statement.md` supplies the six intake sections.
  Copy it to the working drafts folder, fill and confirm that copy with the adopter, then copy the confirmed bytes to the committed evaluation folder as `requirements.md`.
- `contract.skeleton.json` becomes `contract.json` after replacing every whole quoted `"{{key}}"` token with the JSON serialization of its keyed value from the confirmed requirements and corpus. Stamp `sourceSpecDigest` with eval-quality's `digestBytes` over the committed `requirements.md` bytes, then run `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` in order.
- `scoring-policy.template.json` becomes `policy/scoring-policy.json`, eval-quality's scoring policy.
  The adopter sets `policyId`, `severityFloor`, `catchThreshold` and `minimumTrialCount`; `confidenceThreshold` and the three caps carry eval-quality's published defaults, which the adopter may change.
- `evaluator-conditions.template.json` becomes `policy/evaluator-conditions.json`, the model a run uses, the digest of its system prompt and, in its `judge` block, the model the rubric judge uses, which `tea-evaluate run` records in every run's evaluator configuration.
  Its `judge.modelSnapshot` is filled when the contract declares a rubric, naming the model the rubric judge runs; when the contract declares no rubric, delete the `judge` block, since `tea-evaluate check` refuses one nothing uses.
  When the judge is the only model the evaluation uses, the file carries `modelSnapshot: "none"`, `"systemPromptDigest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"` (the digest of the empty byte string, which `tea-evaluate check` requires beside `none`), and the `judge` block.
  An evaluation in which no model runs anywhere (target, evaluator and judge) leaves the file out.
- `evaluation-folder.gitignore` becomes the evaluation folder's `.gitignore`, which keeps `runs/` out of the adopter's commits.
- `evaluators/command-evaluator.mjs` and `evaluators/mapping.json` are starters for an adopter-owned `command` evaluator. Implement its oracle judgment and bind each stable row key to a contract oracle or rubric criterion before running it. `evaluators/LEARNED.md` records primary sources, installed-version behavior, known pass and fail output, and contradictions for an unfamiliar framework.
- `evaluators/agentevals-trajectory.mjs` and `evaluators/promptfoo-assertions.mjs` are framework-specific starters. Copy one into the adopter's `evaluator/` folder with its reference trajectory or assertion file, install that framework in the evaluation folder, and fill `evaluator/mapping.json` for its keys. The evaluator guide states each template's input and configuration.
- `http-probe-port.mjs` becomes the evaluation folder's `adapter/http-probe-port.mjs`, the HTTP port every call of an `api` interface goes through.
  It is rendered unchanged: its default export builds the port from configuration alone (where each interface is, eval-quality's target policy, auth headers, transport), eval-quality's `evaluateTarget` decides every allow or deny, and `tea-evaluate` fills the configuration from the registry's `api` entry for each call.
  Its last lines hand the port to TeA's host when `tea-evaluate` starts the file as its own process; keep them.
  The host speaks to `tea-evaluate` on file descriptor 3, which it reserves for that, so what the port prints on standard output and error stays its own and is quoted when a call fails.
  An `auth` header over `http` goes only to addresses eval-quality's `staysOnHost` keeps on this host, which `tea-evaluate check` holds; a credentialed target at any other address, a private docker-compose service included, is served over `https`, with `NODE_EXTRA_CA_CERTS` in the host's environment naming the PEM file of a private certificate authority that signed its certificate.
  It imports `eval-quality` and TeA's package as bare names, which Node resolves from the port file's own location: a `node_modules` in the evaluation folder or a folder above it must hold both, as the project's own install of TeA with its `eval-quality` peer does; without them the port and its conformance file cannot start.
- `http-probe-port.conformance.mjs` becomes `adapter/http-probe-port.conformance.mjs`.
  `node adapter/http-probe-port.conformance.mjs` runs eval-quality's environment-probe conformance suite over the port against a loopback stub it starts and closes itself, so it needs no deployed target and no secret, and it exits 0 only when every assertion passes.
