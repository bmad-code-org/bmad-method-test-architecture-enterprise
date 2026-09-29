# AI feature evaluation gap report

## 2026-09-28: Imported draft schema repairs

Initial `node cli/evaluate.js check` reported 19 authoring defects. The API operations used the CLI-style `invocation`, `artifacts`, and `descriptorChannel` fields, while the working API contract and engine schema require top-level `method` and `pathTemplate`. The request plan also carried CLI-only null bindings. I moved method and path to their API fields, removed the CLI fields, and made required body keys disjoint from permitted body keys. The registry listed `PORT` in `environmentKeys` even though the runtime owns `portEnvironmentKey`; I removed that passthrough. `evaluation.json` lacked `operationPhases`; all seven grade operations now have `outcome` phase.

The target and intake are frozen. The fixed vendor snapshot remains `fixture-model-1`. No held-out-only interaction was copied into the contract plan.

## 2026-09-28: Compile collision

`eval-quality compile` exited 4 with `duplicate-operation-signature`: seven API operations all mapped to `POST /grade`. I consolidated them into one `grade-answer` operation and kept the seven distinct plan steps and their oracle pointers. Every mutation manifestation witness now names that operation. A body-input sensitivity witness compares a passing answer with a restricted answer. This change preserves the development behavior and keeps held-out-only inputs out of the plan.

The next compile exited 4 with `malformed-operator-expression`: AD-10 does not allow `body` as the sensitivity channel for an operation without a state change. I changed the witness to vary only the `strict` query, holding the answer fixed at the normal boundary. The expected grade moves from pass to reject, making input sensitivity observable without misclassifying grading as a state change.

## 2026-09-28: Refused raw malformed boundary

The confirmed intake includes invalid JSON. eval-quality 4.3.0 `ProbeRequestBody` accepts only `json` or `absent`, and the installed HTTP port serializes JSON. A raw invalid-JSON body cannot be sent through this sealed API pipeline. I retain the raw corpus fixture as a requirements reminder and refuse a sealed invalid-JSON probe until the engine and port support a raw body. The authored missing-answer and non-string JSON probes cover the executable malformed boundaries. A direct endpoint spot check does not count as sealed evidence.

## 2026-09-28: Validation and pause

- `node cli/evaluate.js digest --evaluation test/fixtures/evaluate-authoring/ai-feature/evaluation`: exit 0; 33 indexed files, digest `sha256:2f9815baedbbe66e95113917cf51f02ccd8706ceff42440ecbaf3c030cb08794`.
- `node cli/evaluate.js check --evaluation test/fixtures/evaluate-authoring/ai-feature/evaluation`: exit 0; no authoring defects.
- `./node_modules/.bin/eval-quality compile --in test/fixtures/evaluate-authoring/ai-feature/evaluation/contract.json --out test/fixtures/evaluate-authoring/ai-feature/evaluation/compiled-contract.json`: exit 0.
- `./node_modules/.bin/eval-quality seal --in test/fixtures/evaluate-authoring/ai-feature/evaluation/contract.json --out test/fixtures/evaluate-authoring/ai-feature/evaluation/sealed-brief.json`: exit 0.

The suite retains three trials, the proposed scoring policy, the deterministic evaluator, and fixed vendor snapshot `fixture-model-1`. No live preflight or score ran. Preflight is paused for the concurrent HTTP adapter timeout repair. The adopter still needs to confirm the proposed policy ID and thresholds before live evidence is accepted. Mutation manifestation and rollback remain unverified until live preflight and runs.

Frozen-input check: the first `sha256sum -c` was invoked from the repository root and exited 1 because its relative `target/` paths resolved there. Repeating it from the AI fixture root exited 0 for all four frozen target files.

## 2026-09-28: Live preflight dependency wiring

The first preflight exited 10 because the adapter process could not resolve `bmad-method-test-architecture-enterprise` from its evaluation folder. I linked the worktree package and its installed `eval-quality` into this evaluation's local `node_modules`, matching the repository's API fixture test setup. This is runtime dependency wiring inside the imported evaluation; no target file changed.

The next preflight exited 11 while qualifying P-007. The clean `missing` step sent an absent HTTP body, so the target correctly returned `400 {"error":"invalid JSON"}` and O-003's missing-property expectation was false. I bound an empty JSON object for that step. The port now sends `{}` and can exercise the missing `answer` property that the corpus names. The non-string step already sent JSON `{"answer":42}` and returned the expected 400 error.

A direct `{}` binding failed `tea-evaluate check` with 11 schema defects because an `InputBindingChannel` requires at least one property. I added an inert string `case` field to the missing-answer request. The `answer` property is still absent, and the target ignores the marker. The declared request shape permits that field. The development corpus now records the exact sent body.

The next preflight qualified P-005 through P-008, P-011 through P-013, and gameability P-009 with verified rollback, then exited 4. The engine rejected a duplicate manifestation `legId` shared across probes. I prefixed each manifestation leg ID and its relation pointer with its own probe ID by a blind metadata substitution. No held-out request body was inspected or copied into development artifacts.

The first metadata prefix used uppercase `P`, which violates eval-quality's lowercase leg ID grammar; `check` exited 10. I converted only those new prefixes to lowercase and refreshed the corpus index.

The next preflight exited 3 after every mutation and gameability probe qualified. `preflight-verdict.json` showed `seeded-faults-scoped` failed for D-001 through D-007: a relation checking only `decision` fired on unrelated clean requests of the same consolidated operation. I added a deep equality guard on each witness's observed request body beside its response predicate. This makes the witness specific to the input that manifests its defect. The transformation used each witness's own input in place and did not expose held-out bodies in development notes.

Preflight then left only D-002 unscoped: its normal-boundary body matched a clean strict-query leg whose response is also rejection. I added a deep equality query guard to every manifestation relation, so a response counts only for the same body and query as the fault request. This changes witness scoping without changing target input, behavior, or oracle.

## 2026-09-28: Development score coverage gaps

Development run `20260928T231902618Z-0478c58d` sealed nine three-trial sets. Score invocation `20260928T231954510Z-e56c620b` exited 0 for all nine probes. P-001 through P-004 each had three `passed-clean-control` votes. P-005 through P-008 each had three `caught` votes; gameability P-009 also had three `caught` votes. Every evidence artifact still reported `CONCERNS`, with critical coverage gaps `success-indicator-separation`, `per-record`, and `omission-and-completeness`.

The grade response is a scalar object, so I set `collectionLocations` to an explicit empty list. This accurately closes the per-record and omission declarations. I named `/decision` as the grade result indicator and `/reason` as policy payload, with `/error` diagnostic and `/mode` payload roles. Existing oracles already read status, decision, and reason together, so the indicator cannot earn a pass by itself. This is contract revision 1; `parentDigest` names the scored revision 0 contract digest `sha256:5b7218c116a3974fd8b3a47a1f4e38ab322153a072e47a1d229cfa49275c55e8`.

Revised preflight `20260928T232118694Z-575eeb16` exited 0. Revised development run `20260928T232158405Z-fed25893` exited 0; score invocation `20260928T232247610Z-71b10298` exited 0. Every P-001 through P-009 evidence artifact reports `PASS` and no unsatisfied coverage gap. P-001 through P-004 have three `passed-clean-control` votes each. P-005 through P-009 have three `caught` votes each, with `caughtCount: 3`, `validCount: 3`, and comparable strength. This is the development evidence review before held-out execution.

## 2026-09-28: Held-out class failure reproduction

Held-out run `20260928T232311288Z-49fec596` sealed three trial sets; score invocation `20260928T232346354Z-6d6894e4` exited 3. The allowed `gap-view.json` shows `outcome: null` for P-011 through P-013. CLI diagnostics name oracle `infrastructure-error` and unwitnessed detection claims. I did not read held-out records or probe inputs. The development run had no such error. I added development P-010 using an alternate restricted answer in its selector while the shared contract plan still sends the original restricted request. This reproduces the class-level witness mismatch without opening held-out evidence.

Development P-010 reproduced the held-out class failure: run `20260928T232513406Z-939a4c66` exited 0, while score invocation `20260928T232609224Z-77365a22` exited 3 only for P-010 with three `infrastructure-error` and `unwitnessed detection claim` diagnostics. Its selector named an alternate answer absent from the shared interaction plan. I changed P-010 and the held-out probes' *scoring selector metadata* to select the corresponding planned request by behavior ID. Each probe's distinct mutation manifestation witness remains intact. The transformation did not inspect or copy held-out trial records or request bodies into development artifacts.

After selector repair, preflight `20260928T232650171Z-66360a72` exited 0. Development run `20260928T232731883Z-d34a8edb` and score invocation `20260928T232825779Z-ecfe294a` exited 0. All ten development evidence artifacts report `PASS` with no unsatisfied coverage gap. P-001 through P-004 have three `passed-clean-control` votes; P-005 through P-010 have `caughtCount: 3` of three valid trials each. P-010 confirms the class-level repair before held-out rerun.

## 2026-09-28: Final held-out score

Held-out run `20260928T232841971Z-798a79d8` exited 0. Score invocation `20260928T232918424Z-039790f9` exited 0. The allowed `gap-view.json` reports P-011, P-012, and P-013 caught in three of three valid trials each, with no invalidated attempt. To verify the explicitly requested artifact verdict, I read only each artifact's `scoredProbeId`, `contractVerdict`, and count of unsatisfied coverage gaps after scoring. All three report `PASS` and zero unsatisfied gaps; no held-out input, expected answer, trial record, or observation was read.

The final development score invocation `20260928T232825779Z-ecfe294a` reports `PASS` for P-001 through P-010. Its clean controls pass three trials each; its five defect probes and one gameability probe are caught three of three. The final held-out score invocation above reports `PASS` for P-011 through P-013 and three of three catches. There is no unsatisfied engine gap at or above policy `severityFloor: low` in these scored artifacts. Invalid raw JSON remains the documented engine-schema refusal and follow-up work.

The local `node_modules/` links used by the HTTP port are ignored in this evaluation's `.gitignore`; the sealed `runs/` directory is ignored as well. The authoring files and generated compile/seal artifacts remain in the imported folder. A final frozen-input checksum from the AI fixture root passed for all four target files. The first attempt to append this final report section used a repository-relative path from the fixture directory and failed before writing; I repeated it with the correct relative path.

## 2026-09-28: Final adapter sync and port collision

Copied the final source HTTP adapter and conformance files into this evaluation. Source and copy SHA-256 values match: port `801ef17d0bc63b5cdfa692baf55f4c47a610121afc4289620bcb795037e9684c`; conformance `dff884825b4264e7bbc06a1d2a23cbe3147698d68f6ced022f11f62f1c8ba1d8`. Conformance passed 19/19. Digest remained `sha256:d46fa6b386d3de5f622b2683f27f808e0dc818a1c92861ee39c09f935595127b` for 35 files. Check, compile, seal, and preflight `20260928T233512613Z-b1cdad91` all exited 0.

The first fresh development run `20260928T233554798Z-bcc07f87` exited 12 at clean trial 2. The runtime selected port 53920, already held by an unrelated long-running Playwright test server (PID 88669) in the original repository. This is an infrastructure collision under the frozen target's `PORT`-only launch path. No behavioral verdict came from that partial run. I left the unrelated server alone and will retry a new invocation.

Retry development run `20260928T233657627Z-70ab2549` exited 0. Score invocation `20260928T233749867Z-8fc29c63` exited 0. P-001 through P-010 each report `PASS` and zero unsatisfied coverage gaps. P-001 through P-004 have three valid passed-control trials; P-005 through P-010 were caught in all three valid trials. The prior port-collision run remains an infrastructure attempt, with no score.

Final-source held-out run `20260928T233806427Z-5c534b20` exited 0. Score invocation `20260928T233838321Z-f794865d` exited 0. Its `gap-view.json` reports P-011 through P-013 caught in all three valid trials with no invalidated attempts. Reading only verdict and coverage metadata from the sealed artifacts confirms `PASS` and zero unsatisfied gaps for all three. Together with development score invocation `20260928T233749867Z-8fc29c63`, the final adapter revision has `PASS` for all 13 scored probes, six development seeded or gameability catches of 3/3, three held-out catches of 3/3, and four clean controls passed in all three trials. No replay was built. The raw invalid-JSON engine-schema refusal remains open.

## 2026-09-28: Review repair and refreshed proof

The PR review found that several authored rationales used `[development]` or `[boundary]`, while the approved guidance names the corpus tags `[representative]`, `[negative]`, `[malformed]`, `[gameability]`, and `[held-out]`. I corrected the source tags and regenerated `corpus-index.json` with `tea-evaluate digest`; `check` passed. The frozen target and intake did not change. The replay now includes each run's primary qualification and rollback files, with digest and target-tree checks in `test:evaluate-authoring`.

With the proposed scoring policy still awaiting adopter confirmation, development run `20260929T013649598Z-bffdcbdf` and score `20260929T013744048Z-0ed77d1b` exited 0 for ten probes. Held-out run `20260929T013754877Z-412d9ebd` and score `20260929T013830365Z-fa32eebc` exited 0 for three probes. The two replay bundles retain the sealed records, evidence, and qualification files for independent checking. These are technical proof runs under the proposed policy; final policy acceptance remains pending.

## 2026-09-28: Confirmed policy and final AI replay

The adopter confirmed `severityFloor: low`, `catchThreshold: 0.9`, three trials and policy ID `answer-grade-critical-v1`. The decision is recorded in `policy/decision.md`. The AI policy ID dropped its draft suffix before rerunning `check`, which exited 0. Development run `20260929T015026071Z-cd62054f` and score `20260929T015138101Z-9aa9324d` exited 0 for ten probes. Held-out run `20260929T015150075Z-d649d588` and score `20260929T015241073Z-e81c8e10` exited 0 for three probes. The final replay bundles contain the raw preflight request and response traces, qualification and rollback records, sealed trial records and evidence artifacts. `test:evaluate-authoring` passed against both confirmed-policy AI bundles and the unchanged test-review bundles.
