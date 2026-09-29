# Completion notes

The authored suite is under `evaluation/`. It names the confirmed 2026-09-28 intake, a four-behavior HTTP contract, three trials per probe, representative, negative, malformed, strict-boundary, gameability, controlled-mutation, and held-out cases. `policy/scoring-policy.json` proposes severity floor `low`, catch threshold `0.9`, and minimum trial count `3`. The adopter supplied the trial count and risk ranking but did not choose the policy ID or thresholds. Confirm those proposed values before `tea-evaluate check`.

The user asked whether the underlying vendor model is good at answer grading. Evaluate's vendor rule redirects that question to the adopter's use of the fixed model. `fixture-model-1` is recorded as a fixed target condition. Mutations change only `rules/policy.json` or `server/grade.mjs`; none touches the vendor model.

The deterministic evaluator is selected because status and JSON fields fully express the specified policy. It checks status, decision, and reason together. The HTTP port is copied from the installed template. The server only accepts `PORT`, so import validation must confirm the registry's dynamic-port launch shape. The target is frozen.

No TEA runtime or eval-quality executable exists in this isolated folder. `tea-evaluate digest`, `check`, `preflight`, `run`, `score`, and eval-quality `compile` and `seal` were unavailable. The locally authored corpus index must be regenerated or checked by `tea-evaluate digest`. The exact contract and probe schemas, mutation qualification, rollback, and scoring remain unverified. The invalid-JSON corpus item requires a raw-body route because the provided HTTP port sends JSON or absent bodies. No eval-quality verdict or strength is claimed.

On import, confirm policy choices, install the private runtime, regenerate the index, then run check, compile, seal, and preflight in order. Qualify each mutation in a disposable copy, verify rollback, run and score the development partition, review its evidence, then run held-out and read only `gap-view.json`. Record all live commands and outputs in a new run log.
