---
name: Offline prompt candidate generator
type: adr
status: accepted
created: 2026-10-14
scope: Evaluate discovery lane, features F02 and F13 of the MutEval adoption plan, second slice
binds: [AD-8, AD-22]
sources: [adr-exploratory-candidate-contract.md]
---

# ADR: Offline prompt candidate generator

## Context

The first slice defined the exploratory candidate record and its boundary against every scored artifact. This slice adds the producer: `cli/lib/evaluate/discovery/generator.js`, a library entry point (`previewCandidates`, `renderPreview`) with no command, no file access, no process, no network and no model call.

## Decision

The generator takes the target file's bytes, the digest of the requirements statement as `evaluation.json` records it, a campaign ID and a seed. It returns a preview: the selected candidates as slice-one records in the `generated` state, the rejected sites with a code and a message, and counts per family (found, selected, omitted, rejected). The caller writes the records it keeps with `serializeCandidate`.

Three families, versioned together by `GENERATOR_VERSION`:

- `modal-strength`: `must` and `shall` become `should`.
- `negation`: `do not`, `must not`, `shall not`, `should not`, their contractions, `cannot` and `never` lose the negation.
- `numeric-threshold`: the integer after a recognized bound phrase loosens in the direction of the bound. A lower bound halves and an upper bound doubles. Version numbers, dates, times, decimals, thousands separators and ranges are not bounds.

A fourth family (instruction removal) was left out. Removing a line needs a recognizer for "instruction" lines, and none of the three families needs one.

One candidate changes one word or number. Its `find` is the whole line that holds the site and its `replace` is that line after the change. The line has to occur once in the target, counted as the native `replace-exact` planner counts it (overlaps included), so a line repeated elsewhere or contained in a longer line is rejected as a repeated span. The candidate's edit therefore needs no translation to become a mutation.

A site is rejected, with its reason in the preview, when it sits in front matter, a code fence, inline code, a quotation, a heading, a block quote, an HTML comment, a link target, a URL or a placeholder, when its edit would break the grammar (a noun `must`, a number that turns a plural unit singular), when it reads as a statement of fact (`has never`, `we do not`), when it sits in a question, when a negation follows it, or when a percentage would pass 100.

F13 is limited to selection. Sites of a family rank by a digest of the seed and the site, the lowest ranks up to `perFamilyCap` (5 by default) are kept, and the rest count as omitted. Kept candidates are numbered in catalog and document order. The seed is recorded in each candidate's generator field, which its identity covers, so the same input, configuration and seed give the same identities and a different seed gives different ones.

## What fails if this is reverted

| Claim                                                    | What fails                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The seed chooses which sites a cap keeps                 | `contractProblems` for a generator that ranks without the seed, and the seed-dependent golden preview                 |
| The seed is recorded and part of every identity          | `contractProblems` for a generator that records another seed                                                          |
| A repeated or contained line is never a candidate        | `contractProblems` for a generator without the check and for one that counts occurrences differently than the planner |
| Protected spans are never edited                         | `contractProblems` for a generator that skips protection, and the rule table                                          |
| Every candidate is a valid one-line `replace-exact` edit | the native planner run on the fixture bytes for every candidate, and the mutation schema                              |
| A preview makes no call                                  | the source scan of `generator.js` and the spied run in `test/test-evaluate-generator.js`                              |
| The preview is reproducible                              | the golden JSON and text under `test/fixtures/evaluate-generator/`                                                    |
