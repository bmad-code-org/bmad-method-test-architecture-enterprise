# Story identity and intake

Every story-scoped TEA workflow (Automate red and expand mode, Trace, NFR, Test Review) resolves a story, reads it, and names its outputs by these rules, so the same story gets the same key in every workflow. Each workflow adds only its own rules on top.

## 1. Resolve the story

Decide the route once, from the reference the user gave or the artifacts already loaded:

- **v6 story file.** The reference is a path to a Markdown story outside any `initiative-*/` or `backlog/` folder, or `{project-root}/_bmad/method/scripts/tickets.py` does not exist. Use the story file as the workflow always has, with the v6 key in section 4.
- **v7 ticket.** Anything else: `<epic id>.<entry id>` (`1.2`), an entry id, a tracker id, a leaf file name or path, or a title phrase. Run:

  ```bash
  uv run {project-root}/_bmad/method/scripts/tickets.py --project-root {project-root} find [<dir>] <ref>
  ```

  For a leaf file path, pass its container folder as `<dir>` and its basename as `<ref>`. Otherwise leave `<dir>` out unless the user named an initiative, epic or `backlog/` folder.

The output is one JSON object. A result with `error`:

- No match, an ambiguous phrase, or no active initiative: in an interactive run, show the message and ask which story or folder is meant; **halt** until answered. A headless run halts with the message.
- A parent initiative: list its child initiatives and ask which one; a headless run halts with the list.
- The earlier layout: **halt** and tell the user to run `bmad migrate`, which moves the breakdown into `tickets/`.

A v7 error never falls back to the v6 route.

## 2. Read the story

From the `find` result:

- **Ticket text:** the file at `story_file` when it is not null; otherwise the entry's `description`, `verify`, `references` and `notes` from the result. A pulled leaf's `Verify:` line is in the leaf.
- **Story context:** the files the story's own `companions` and typed References name.
- **Parent context:** when `epic_file` is not null, read its Requirements lines whose ids the story's `covers` lists, its Constraints, and the files its `companions` and References name. When it is null (a `backlog/` leaf), skip parent discovery.
- **Plan:** when the file at `plan` exists, read its acceptance criteria. Its `## Prior builds` section is history, never criteria.

Record each file read with its path. List a file that cannot be read as unavailable; never guess its content.

**Criteria, in this order:**

1. The ticket's numbered criteria, each keeping the `R` ids it names.
2. When the ticket has only a `verify` line: the plan's acceptance criteria, when the plan has any.
3. Otherwise the `verify` line, as one criterion carrying the story's `covers`.

When the ticket and the plan both list criteria and they differ, an interactive run shows both and asks which hold; a headless run uses the ticket's and lists the plan-only criteria as unreconciled in its output.

## 3. Classify the container

From the `find` result's `folder`, which names the container (its `epic` field holds the same name for every shape, so it does not tell them apart):

- **Epic entry:** `folder` starts with `epic-`. The initiative is the `initiative-*` folder above `tickets/` in the `epic_file` path. The `ref` is `<epic id>.<entry id>` when the initiative numbers the epic; an epic its initiative does not number gives a bare entry id, and has no epic id.
- **Initiative entry:** `folder` starts with `initiative-`. The `ref` is the bare entry id, and `epic_file` is the initiative's own file.
- **Backlog leaf:** `folder` is `backlog`. The `ref` and `file` are the leaf's file name, and `epic_file` is null.

Only an epic entry has epic context: its epic's Test Design (`test-design-epic-<epic id>.md`) and epic-scoped reports; an epic with no epic id has no numbered Test Design to look up. An initiative entry or backlog leaf skips every epic lookup and goes straight to the system-level and legacy names.

## 4. Name the story

- `story_id`: the `ref` (`1.2`) for a v7 ticket; the story id the v6 story states otherwise.
- `story_key`:
  - epic entry: `<initiative>--e<epic id>-s<entry id>`, for example `shop--e1-s2`; for an epic with no epic id, `<initiative>--<epic folder>-s<entry id>`, for example `shop--epic-loyalty-s2`. Never read the entry id as an epic id;
  - initiative entry: `<initiative>--s<entry id>`;
  - backlog leaf: `backlog--<leaf file stem>`;
  - v6 story file: the file's basename without `.md` (`1-2-user-authentication`); without a file, the story id with `.` replaced by `-`.

  `<initiative>` is the initiative folder name without its `initiative-` prefix. An entry id is used as written, letters included (`s6a`, `sCC2`). Folder names never contain `--`, so keys of different shapes and initiatives never collide. Entry ids and containers do not change when an entry is retitled, so neither does the key.

- `ticketRef`: the `ref` plus the container folder relative to `{project-root}`, for example `1.2 @ _bmad-output/initiative-shop/tickets/epic-checkout`, `2 @ _bmad-output/initiative-shop-e1` or `story-coupon-banner.md @ _bmad-output/backlog`. Empty for a v6 story.
- `storyFile`: the leaf or v6 story path; empty for an entry that is not pulled.

Checkpoints record `storyId`, `storyKey`, `ticketRef` and `storyFile`. A check that requires the story's location accepts `storyFile` or `ticketRef`.

Every story output of every workflow uses `story-<story_key>` as its run key, so ATDD checklists, automation summaries, NFR reports, Test Review reports and traceability matrices for one story share it.

## 5. Artifacts from before v7 keys

This applies only to a story resolved through the v7 route; a v6 or no-method run never mentions it. When no output exists under the new key but the test artifacts folder holds story outputs whose key is not one of the shapes above (a v6 basename such as `1-2-user-authentication`, or a leaf stem such as `story-guest-checkout`), tell the user that `bmad migrate tea` carries them onto their tickets, and ask whether to run it first. Continue as a fresh run only if they decline. A headless run continues and says so in its output.

Every resume of a story run loads this section too. A migrated artifact carries `resolvedSources`: per citation, the original reference, its current location, and `resolved` or `unresolved`. Read a citation through its `resolved` entry. Report an `unresolved` citation; never follow it. Leave the original citation as written.
