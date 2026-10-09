# Test Generation Live Evidence

`evidence.json.gz` stores 20 live captures and their raw artifacts as a versioned JSON map of base64 bytes.
`index.json` pins the compressed archive digest and lists the captures.
The generation-healing suite verifies the archive and each captured artifact against its original provenance digest.

To inspect the original files, extract into a new directory:

```bash
node test/lib/generation-evidence.js --extract /tmp/tea-generation-evidence-review
```

Each capture includes its actual invocation, prompts, output, reports, source/config baselines and the staged instruction snapshots that produced it.
Snapshots describe the captured run; they do not assert equality with current repository instructions.
The v2.0.0 checkpoint cases include the original Create evidence and source tag.
The settings cases label their seeded state and reconstructed pre-run summary separately.
Raw files retain original whitespace and line endings.

The legacy terminal capture continues the genuine expand checkpoint after generation and aggregation. Its manifest pins the terminal inputs, output, native report and staged sources; the physical hook log resolves the agent's inaccurate description of prior hook entries.
