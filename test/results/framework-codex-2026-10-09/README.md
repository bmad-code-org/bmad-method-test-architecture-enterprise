# Framework and CI Codex evaluation

The retained captures use `gpt-5.6-sol`, the repository's Codex adapter default. `evidence.json.gz` contains a JSON object with `manifest` and `files`. Each file entry stores its original bytes as base64 and their SHA-256 digest. `index.json` pins the compressed archive. The framework CLI suite checks both levels of integrity.

The Python baseline and after generation each produced two working unittest tests. Native verification detects two application mutations, preserves application source and validates the generated GitHub Actions pipeline. Each scored 9/9 on its recorded checks. The check sets differ, so these scores do not establish an improvement in generation quality.

The baseline bypassed the skill's existing Git requirement in a fixture without a Git worktree. The new early router guard and CLI preflight reject this condition before generating CI. The early after capture stopped at that boundary, then continued through Resume after a separate Git initialization.

The browser baseline generated a real Playwright counter test. Its managed execution retained an incomplete journal after sandbox restrictions. Independent host execution passes the test and detects a disabled increment mutation; the baseline's recorded score is 6/7 because the shared journal remained incomplete.

The default Codex browser Resume also reports incomplete when macOS denies Chromium launch. A separately authorized custom wrapper uses full access in a disposable project, with the same explicit model pin. The final live confirmation completed both phases. The CLI reran one passing Chromium test, and independent host execution plus mutation and pipeline checks scored 7/7. Both the default restriction and the custom result remain in the archive. The custom result's generic model field is null; the retained wrapper records the actual model selection.

Early after captures used uncommitted CLI prototypes. Their exact prototype source bytes were not captured. Their effective prompts and raw agent streams remain available. Final native controller verification is separately labeled as a post-capture check. The final browser custom run used the committed framework CLI at `c7075fc0ff35843df554a948f7d45066964ff18b`. Baseline skill sources and prompts are retained from `cbcf937135585c072846026ea7cacbcedf74182d`.

To inspect a file without modifying the capture:

```js
const fs = require('node:fs');
const zlib = require('node:zlib');
const capture = JSON.parse(zlib.gunzipSync(fs.readFileSync('test/results/framework-codex-2026-10-09/evidence.json.gz')));
const file = capture.files['after/score.json'];
console.log(Buffer.from(file.base64, 'base64').toString('utf8'));
```

Model generation, default sandbox outcomes and post-capture native execution have separate records. Dependencies, Git internals and duplicate mutation projects are excluded; the original application, generated tests, journals, pipelines, prompts, transcripts and native command logs retain their bytes.

The earlier full-access attempt ended at a handoff without a recovered final exit or raw stdout. Its prompt and partial journal remain. The confirmation is a separate live Resume with source snapshots and raw streams written during execution. The initial native browser scoring attempt used an absent npm test script; its failure logs remain under `independent-validation`. Final scores execute the actual frozen commands.
