/**
 * The plan's counts and lane lists are held to the files that own them, and each hold fails when its subject changes by one.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/planning-doc-sources.js` refuses a plan whose lane lists disagree.
 * `eval-quality.config.json` holds the replay totals of `test/README.md` and of the header of `test/test-eval-replay.js`.
 * It also holds the story count, the epic count and the appended-story count of the `epics.md` overview, and the lane count of its parallel-lanes section.
 * A gate that passes on the committed tree proves nothing about whether it would fail on a drifted one.
 * So this file hands every check data that has drifted by one and requires the failure to name what moved:
 *
 *   - the pure checks, over the committed `epics.md` and `sprint-status.yaml`
 *     with one entry removed from each of the five lanes (in each file),
 *     a story moved to another lane in one file only,
 *     a story duplicated across two lanes and within one,
 *     an order swap at the start and at the end of each lane,
 *     a lane missing from either file, a sixth lane in one file only,
 *     an entry with no status row,
 *     and the appended-story lists with an id dropped, added, repeated or out of order;
 *   - the fence and heading readers, over fences CommonMark opens and closes in other ways than the plain one;
 *   - the loader, over scratch roots that hold the two files;
 *   - the real `doc-counts` gate, over scratch trees of the final repository
 *     in which one sentence, one lane list, one stored replay case or one count is off by one,
 *     with the untouched tree as the negative control that proves the scratch tree itself passes;
 *   - every `doc-counts` entry and source that existed before Story 1.95, pinned by name and by what it reads.
 *
 * A scratch tree symlinks every path of the repository except the files it overrides.
 * Nothing in the working tree is ever edited, and a process killed mid-test leaves the real files as they were.
 *
 * Usage: node test/test-planning-doc-sources.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const planning = require('./lib/planning-doc-sources.js');
const docCounts = require('./lib/doc-count-sources.js');

const PROJECT_ROOT = path.join(__dirname, '..');
const GATE_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'eval-quality-gates');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'eval-quality.config.json');
const LANES = [1, 2, 3, 4, 5];

// Every count a sentence states is read from the module that derives it, so adding a replay case or a story section leaves this file as it is.
const STORIES = planning.STORY_COUNT;
const APPENDED = planning.APPENDED_STORY_COUNT;
const REPLAY = {
  total: docCounts.REPLAY_TOTAL,
  scored: docCounts.REPLAY_SCORED,
  constructed: docCounts.REPLAY_SCORED_CONSTRUCTED,
  bytes: docCounts.REPLAY_CAPTURED_BYTES,
  atddBytes: docCounts.REPLAY_ATDD_CAPTURED_BYTES,
  testReviewBytes: docCounts.REPLAY_TEST_REVIEW_CAPTURED_BYTES,
  trace: docCounts.REPLAY_TRACE,
  nfr: docCounts.REPLAY_NFR,
  ciFullAndMinimal: docCounts.REPLAY_CI_FULL_AND_MINIMAL,
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number from zero to ninety-nine as the lower-case word a page spells it with. */
function word(number) {
  if (number < 20) return ONES[number];
  return TENS[Math.floor(number / 10)] + (number % 10 === 0 ? '' : `-${ONES[number % 10]}`);
}

const capital = (text) => text[0].toUpperCase() + text.slice(1);
const escapeRegExp = (text) => text.replaceAll(/[$()*+.?[\\\]^{|}/]/g, String.raw`\$&`);

const failures = [];
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

const read = (relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8');
const epicsText = read(planning.EPICS_RELATIVE);
const sprintText = read(planning.SPRINT_STATUS_RELATIVE);

function replaceOnce(text, from, to) {
  const at = text.indexOf(from);
  assert.ok(at !== -1, `fixture setup: "${from}" is not in the text`);
  assert.strictEqual(text.indexOf(from, at + 1), -1, `fixture setup: "${from}" is in the text twice`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

// ---------------------------------------------------------------------------
// Lane editing over the committed text
// ---------------------------------------------------------------------------

const epicLaneLine = (lane) => new RegExp(String.raw`^(\*\*Lane ${lane}: [^*\n]+\*\*(?: \([^)\n]*\))?: )(.+?)(\.(?: .*)?)$`, 'm');

/** `epics.md` with `mutate` applied to the items of one lane list; an item may carry a parenthetical note. */
function withEpicLane(text, lane, mutate) {
  const match = epicLaneLine(lane).exec(text);
  assert.ok(match, `fixture setup: no Lane ${lane} paragraph`);
  const items = mutate(match[2].match(/\d+\.\d+(?: \([^)\n]*\))?/g));
  return text.replace(epicLaneLine(lane), (_whole, head, _list, tail) => `${head}${items.join(', ')}${tail}`);
}

/** `epics.md` without the paragraph of one lane. */
function withoutEpicLane(text, lane) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.startsWith(`**Lane ${lane}:`));
  assert.ok(at !== -1, `fixture setup: no Lane ${lane} paragraph`);
  lines.splice(at, 1);
  return lines.join('\n');
}

const sprintLaneStart = (lines, lane) => lines.findIndex((line) => new RegExp(`^  lane-${lane}-[^:]+:$`).test(line));

function sprintLaneEnd(lines, start) {
  let end = start + 1;
  while (end < lines.length && /^ {4}(- |#)/.test(lines[end])) end += 1;
  return end;
}

/** `sprint-status.yaml` with `mutate` applied to the row keys of one lane. */
function withSprintLane(text, lane, mutate) {
  const lines = text.split('\n');
  const start = sprintLaneStart(lines, lane);
  assert.ok(start !== -1, `fixture setup: no lane-${lane} list`);
  const end = sprintLaneEnd(lines, start);
  const entries = lines
    .slice(start + 1, end)
    .filter((line) => line.startsWith('    - '))
    .map((line) => line.slice(6));
  lines.splice(start + 1, end - start - 1, ...mutate(entries).map((entry) => `    - ${entry}`));
  return lines.join('\n');
}

/** `sprint-status.yaml` without one lane's key and list. */
function withoutSprintLane(text, lane) {
  const lines = text.split('\n');
  const start = sprintLaneStart(lines, lane);
  assert.ok(start !== -1, `fixture setup: no lane-${lane} list`);
  lines.splice(start, sprintLaneEnd(lines, start) - start);
  return lines.join('\n');
}

const idOfRow = (key) => /^(\d+)-(\d+)-/.exec(key).slice(1).join('.');
const plain = (item) => item.replace(/ \(.*$/, '');
const swap = (items, left, right) => items.map((item, index) => (index === left ? items[right] : index === right ? items[left] : item));

const lanesOf = (epics, sprint) => planning.checkLanes(planning.readEpicLanes(epics), planning.readSprintLanes(sprint));
const laneProblems = (epics, sprint) => lanesOf(epics, sprint).problems;

function assertProblem(problems, expected) {
  const held = problems.length === 0 ? 'none' : `\n    ${problems.join('\n    ')}`;
  assert.ok(problems.includes(expected), `expected the problem:\n    ${expected}\n  got ${held}`);
}

/** The committed lane lists, read once more with plain regular expressions and none of the module's code. */
function independentLanes() {
  const lanes = new Map();
  for (const line of epicsText.split('\n')) {
    const opening = /^\*\*Lane (\d):/.exec(line);
    if (!opening) continue;
    const afterLabel = line.slice(line.indexOf('): ') + 3);
    const list = afterLabel.split(/\.(?= |$)/)[0];
    lanes.set(Number(opening[1]), list.match(/\d+\.\d+/g));
  }
  return lanes;
}

const epicItems = (lane) =>
  epicLaneLine(lane)
    .exec(epicsText)[2]
    .match(/\d+\.\d+(?: \([^)\n]*\))?/g);

function sprintEntries(lane) {
  let held;
  withSprintLane(sprintText, lane, (entries) => {
    held = entries;
    return entries;
  });
  return held;
}

// ---------------------------------------------------------------------------
// The committed files
// ---------------------------------------------------------------------------

check('the committed lane lists agree, and the check counts the five lanes and every entry it compared', () => {
  const result = lanesOf(epicsText, sprintText);
  assert.deepStrictEqual(result.problems, []);
  const independent = independentLanes();
  assert.deepStrictEqual([...independent.keys()], LANES);
  assert.strictEqual(result.lanes, 5);
  assert.strictEqual(
    result.stories,
    [...independent.values()].reduce((sum, ids) => sum + ids.length, 0),
  );
  for (const lane of LANES) {
    assert.deepStrictEqual(planning.readEpicLanes(epicsText).get(lane), independent.get(lane), `Lane ${lane} of epics.md`);
    assert.deepStrictEqual(
      planning.readSprintLanes(sprintText).lanes.get(lane).map(idOfRow),
      independent.get(lane),
      `lane-${lane} of sprint-status`,
    );
  }
});

check('the exports are the counts of the files, recomputed with plain line counts', () => {
  const lines = epicsText.split('\n');
  const storyNumber = (line) => /^### Story 1\.(\d+):/.exec(line)?.[1];
  assert.strictEqual(planning.STORY_COUNT, lines.filter((line) => line.startsWith('### Story ')).length);
  assert.strictEqual(planning.EPIC_COUNT, lines.filter((line) => /^## Epic \d+:/.test(line)).length);
  assert.strictEqual(planning.APPENDED_STORY_COUNT, lines.filter((line) => Number(storyNumber(line)) >= 27).length);
  assert.strictEqual(planning.LANE_COUNT, 5);
  assert.deepStrictEqual(planning.loadPlanningSources(PROJECT_ROOT), {
    STORY_COUNT: planning.STORY_COUNT,
    EPIC_COUNT: planning.EPIC_COUNT,
    APPENDED_STORY_COUNT: planning.APPENDED_STORY_COUNT,
    LANE_COUNT: planning.LANE_COUNT,
  });
});

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

for (const lane of LANES) {
  const items = epicItems(lane);
  const entries = sprintEntries(lane);
  const middle = Math.floor(items.length / 2);
  const id = plain(items[middle]);
  assert.strictEqual(idOfRow(entries[middle]), id, `fixture setup: lane ${lane} agrees at its middle`);
  const other = (lane % 5) + 1;

  check(`lane ${lane}: an entry removed from epics.md is named`, () => {
    const problems = laneProblems(
      withEpicLane(epicsText, lane, (held) => held.filter((_item, index) => index !== middle)),
      sprintText,
    );
    assertProblem(problems, `Lane ${lane}: sprint-status lists ${id}, which epics.md leaves out of Lane ${lane}`);
  });

  check(`lane ${lane}: an entry removed from sprint-status.yaml is named`, () => {
    const problems = laneProblems(
      epicsText,
      withSprintLane(sprintText, lane, (held) => held.filter((_entry, index) => index !== middle)),
    );
    assertProblem(problems, `Lane ${lane}: epics.md lists ${id}, which sprint-status leaves out of lane-${lane}`);
  });

  check(`lane ${lane}: the first and the last entry removed from epics.md are named`, () => {
    assertProblem(
      laneProblems(
        withEpicLane(epicsText, lane, (held) => held.slice(1)),
        sprintText,
      ),
      `Lane ${lane}: sprint-status lists ${plain(items[0])}, which epics.md leaves out of Lane ${lane}`,
    );
    assertProblem(
      laneProblems(
        withEpicLane(epicsText, lane, (held) => held.slice(0, -1)),
        sprintText,
      ),
      `Lane ${lane}: sprint-status lists ${plain(items.at(-1))}, which epics.md leaves out of Lane ${lane}`,
    );
  });

  check(`lane ${lane}: a story moved to lane ${other} in epics.md only is named in both lanes`, () => {
    const moved = withEpicLane(
      withEpicLane(epicsText, lane, (held) => held.filter((_item, index) => index !== middle)),
      other,
      (held) => [...held, id],
    );
    const problems = laneProblems(moved, sprintText);
    assertProblem(problems, `Lane ${lane}: sprint-status lists ${id}, which epics.md leaves out of Lane ${lane}`);
    assertProblem(problems, `Lane ${other}: epics.md lists ${id}, which sprint-status leaves out of lane-${other}`);
  });

  check(`lane ${lane}: a story moved to lane ${other} in sprint-status.yaml only is named in both lanes`, () => {
    const moved = withSprintLane(
      withSprintLane(sprintText, lane, (held) => held.filter((_entry, index) => index !== middle)),
      other,
      (held) => [...held, entries[middle]],
    );
    const problems = laneProblems(epicsText, moved);
    assertProblem(problems, `Lane ${lane}: epics.md lists ${id}, which sprint-status leaves out of lane-${lane}`);
    assertProblem(problems, `Lane ${other}: sprint-status lists ${id}, which epics.md leaves out of Lane ${other}`);
  });

  check(`lane ${lane}: a story in two lanes is named in epics.md and in sprint-status.yaml`, () => {
    const lowest = Math.min(lane, other);
    const highest = Math.max(lane, other);
    assertProblem(
      laneProblems(
        withEpicLane(epicsText, other, (held) => [...held, id]),
        sprintText,
      ),
      `epics.md puts Story ${id} in lanes ${lowest} and ${highest}`,
    );
    assertProblem(
      laneProblems(
        epicsText,
        withSprintLane(sprintText, other, (held) => [...held, entries[middle]]),
      ),
      `sprint-status puts Story ${id} in lanes ${lowest} and ${highest}`,
    );
  });

  check(`lane ${lane}: a story twice in one lane is named`, () => {
    assertProblem(
      laneProblems(
        withEpicLane(epicsText, lane, (held) => [...held, held[middle]]),
        sprintText,
      ),
      `epics.md puts Story ${id} in lane ${lane} twice`,
    );
    assertProblem(
      laneProblems(
        epicsText,
        withSprintLane(sprintText, lane, (held) => [...held, held[middle]]),
      ),
      `sprint-status puts Story ${id} in lane ${lane} twice`,
    );
  });

  check(`lane ${lane}: an order swap at the start and at the end of a lane is named with the position`, () => {
    const at = items.length - 2;
    assertProblem(
      laneProblems(
        withEpicLane(epicsText, lane, (held) => swap(held, 0, 1)),
        sprintText,
      ),
      `Lane ${lane}: the order differs from position 1, where epics.md has ${plain(items[1])} and sprint-status has ${plain(items[0])}`,
    );
    assertProblem(
      laneProblems(
        epicsText,
        withSprintLane(sprintText, lane, (held) => swap(held, at, at + 1)),
      ),
      `Lane ${lane}: the order differs from position ${at + 1}, where epics.md has ${plain(items[at])} and sprint-status has ${idOfRow(entries[at + 1])}`,
    );
  });

  check(`lane ${lane}: a lane missing from one file is named`, () => {
    assertProblem(
      laneProblems(withoutEpicLane(epicsText, lane), sprintText),
      `sprint-status has lane-${lane} and epics.md has no Lane ${lane} paragraph`,
    );
    assertProblem(
      laneProblems(epicsText, withoutSprintLane(sprintText, lane)),
      `epics.md has Lane ${lane} and sprint-status has no lane-${lane} list`,
    );
  });
}

check('a lane missing from both files leaves a gap in the numbering, and the last lane missing from both leaves four lanes', () => {
  const gap = laneProblems(withoutEpicLane(epicsText, 3), withoutSprintLane(sprintText, 3));
  assertProblem(gap, 'the lanes are numbered 1, 2, 4, 5; they have to run 1 to 4 with no gap');
  const four = lanesOf(withoutEpicLane(epicsText, 5), withoutSprintLane(sprintText, 5));
  assert.deepStrictEqual(four.problems, []);
  assert.strictEqual(four.lanes, 4, 'the count of compared lanes is what the prose sentence is held against');
});

/** The `development_status` line of a row key, whatever its status is today. */
function statusLine(key) {
  const match = new RegExp(`^  ${escapeRegExp(key)}: .*\\n`, 'm').exec(sprintText);
  assert.ok(match, `fixture setup: no status row for ${key}`);
  return match[0];
}

check('a lane entry without a status row, and a story with two status rows, are named', () => {
  const row = sprintEntries(4).at(-1);
  const id = idOfRow(row);
  const without = replaceOnce(sprintText, statusLine(row), '');
  const problems = laneProblems(epicsText, without);
  assertProblem(problems, `sprint-status lane 4 lists "${row}", which has no row under development_status`);
  assertProblem(problems, `Lane 4: Story ${id} maps to 0 status rows, and it has to map to exactly one`);
  const twice = replaceOnce(sprintText, statusLine(row), `${statusLine(row)}  ${id.replace('.', '-')}-another-row: backlog\n`);
  assertProblem(laneProblems(epicsText, twice), `Lane 4: Story ${id} maps to 2 status rows, and it has to map to exactly one`);
});

check('a lane entry with no epic-story prefix is named', () => {
  const problems = laneProblems(
    epicsText,
    withSprintLane(sprintText, 5, (held) => [...held, 'owner-handoff']),
  );
  assertProblem(problems, 'sprint-status lane 5 lists "owner-handoff", which has no <epic>-<story>- prefix');
});

check(
  'a row key with no slug after its epic and story numbers is not a story row, and a lane list that runs on past its last id is refused',
  () => {
    const slugRow = sprintEntries(4).find((entry) => entry.startsWith('1-96-'));
    const noSlug = replaceOnce(sprintText, statusLine(slugRow), '  1-96: done\n');
    const problems = laneProblems(
      epicsText,
      withSprintLane(noSlug, 4, (held) => held.map((entry) => (entry.startsWith('1-96-') ? '1-96' : entry))),
    );
    assertProblem(problems, 'sprint-status lane 4 lists "1-96", which has no <epic>-<story>- prefix');
    const lane2 = epicLaneLine(2).exec(epicsText)[0].split('\n')[0];
    assert.throws(
      () => planning.readEpicLanes(replaceOnce(epicsText, lane2, '**Lane 2: confinement** (own worktree): 1.62, 1.57.5 and prose')),
      /opens Lane 2 without a colon-delimited list of story ids/,
    );
    assert.throws(
      () => planning.readEpicLanes(replaceOnce(epicsText, lane2, '**Lane 2: confinement** (own worktree): 1.62, 1.57')),
      /opens Lane 2 without a colon-delimited list of story ids/,
      'a list with no closing full stop',
    );
  },
);

check('the lane readers refuse a paragraph or a key they cannot read', () => {
  const lane2 = epicLaneLine(2).exec(epicsText)[0].split('\n')[0];
  assert.throws(
    () => planning.readEpicLanes(replaceOnce(epicsText, lane2, '**Lane 2: confinement** (own worktree): 1.62 1.57 and prose')),
    /opens Lane 2 without a colon-delimited list of story ids/,
  );
  assert.throws(() => planning.readEpicLanes(`${epicsText}\n${lane2}\n`), /opens Lane 2 a second time/);
  assert.throws(
    () => planning.readEpicLanes(replaceOnce(epicsText, lane2, '**Lane 2: confinement** (own worktree) 1.62, 1.57.')),
    /opens Lane 2 without a colon-delimited list of story ids/,
    'a list with no colon before it',
  );
  assert.throws(() => planning.readEpicLanes('no lane paragraph at all\n'), /holds no "\*\*Lane <n>: <title>\*\*" paragraph/);
  assert.throws(
    () => planning.readSprintLanes(replaceOnce(sprintText, '  lane-1-run-integrity-scoring-evaluators:', '  first-lane:')),
    /does not read lane-<n>-<slug>/,
  );
  assert.throws(
    () =>
      planning.readSprintLanes(replaceOnce(sprintText, '  lane-5-withheld-history-intake-and-the-skill-guide:', '  lane-4-another-key:')),
    /holds lane 4 under two keys/,
  );
  assert.throws(() => planning.readSprintLanes('development_status:\n  a: b\n'), /holds no parallel_lanes map/);
  assert.throws(() => planning.readSprintLanes('parallel_lanes:\n  lane-1-x:\n    - a\n'), /holds no development_status map/);
  assert.throws(
    () => planning.readSprintLanes('development_status:\n  a: b\nparallel_lanes:\n  lane-1-x: not-a-list\n'),
    /is not a list of row keys/,
  );
});

check(
  'a lane note in parentheses after an id stays out of the id, notes on two ids keep the ids between them, and the last lane entry is read',
  () => {
    const lane3 = planning.readEpicLanes(epicsText).get(3);
    assert.strictEqual(lane3.at(-1), '2.6');
    assert.ok(epicItems(3).at(-1).startsWith('2.6 ('), 'fixture setup: lane 3 carries a note after its last id');
    const noted = planning.readEpicLanes(
      withEpicLane(epicsText, 4, (held) => [...held.slice(0, -1), `${held.at(-1)} (a note, with a comma)`]),
    );
    assert.deepStrictEqual(noted.get(4), planning.readEpicLanes(epicsText).get(4));
    const original = planning.readEpicLanes(epicsText).get(4);
    const twoNotes = planning.readEpicLanes(
      withEpicLane(epicsText, 4, (held) =>
        held.map((item, index) => (index === 0 ? `${item} (after 1.98 merges, see 2.5)` : index === 2 ? `${item} (after 1.96)` : item)),
      ),
    );
    assert.deepStrictEqual(
      twoNotes.get(4),
      original,
      'a note must end at its own closing parenthesis, so the ids between two notes stay in the lane',
    );
  },
);

// A lane the file numbers beyond five is a lane: a paragraph in epics.md only and a list in sprint-status.yaml only are each named.
check('a sixth lane in one file only is named, whichever file holds it', () => {
  const sixth = laneProblems(`${epicsText}\n**Lane 6: extra** (own worktree): 1.200.\n`, sprintText);
  assertProblem(sixth, 'epics.md has Lane 6 and sprint-status has no lane-6 list');
  const row = sprintEntries(4).at(-1);
  const sprintSixth = replaceOnce(sprintText, '\nowner_handoff:', `\n  lane-6-extra:\n    - ${row}\nowner_handoff:`);
  assertProblem(laneProblems(epicsText, sprintSixth), 'sprint-status has lane-6 and epics.md has no Lane 6 paragraph');
  assert.strictEqual(planning.readEpicLanes(`${epicsText}\n**Lane 6: extra** (own worktree): 1.200.\n`).size, 6);
});

// ---------------------------------------------------------------------------
// Story sections and the appended stories
// ---------------------------------------------------------------------------

check('story sections are counted outside fences, H.1 included, and an id held twice or a malformed heading is refused', () => {
  const headings = planning.readStoryHeadings(epicsText);
  assert.ok(headings.some(({ id }) => id === 'H.1'));
  assert.ok(headings.some(({ id }) => id === '2.6'));
  const fenced = `${epicsText}\n\`\`\`md\n### Story 9.9: A heading inside a fence\n\`\`\`\n`;
  assert.strictEqual(planning.readStoryHeadings(fenced).length, headings.length);
  assert.strictEqual(planning.readStoryHeadings(`${epicsText}\n### Story 9.9: Outside a fence\n`).length, headings.length + 1);
  const counted = (appended) => planning.readStoryHeadings(`${epicsText}\n${appended}\n`).length - headings.length;
  // CommonMark: a longer fence closes only on a line at least as long, so a shorter run inside it stays in the fence.
  assert.strictEqual(
    counted('````md\n```\n### Story 9.9: Hidden\n````'),
    0,
    'a heading under a shorter fence line inside a four-backtick fence stays hidden',
  );
  assert.strictEqual(
    counted('````md\n```\n````\n### Story 9.9: Example'),
    1,
    'the four-backtick fence closes on its own line and the heading after it counts',
  );
  // A line that carries an info string cannot close a fence.
  assert.strictEqual(counted('```md\n```js is how a fence opens\n### Story 9.9: Hidden\n```'), 0);
  assert.strictEqual(counted('```md\n```js is how a fence opens\n```\n### Story 9.9: Example'), 1);
  // A marker line indented four spaces is indented code and opens nothing.
  assert.strictEqual(counted('    ```\n### Story 9.9: Example'), 1);
  assert.strictEqual(counted('   ```md\n### Story 9.9: Hidden\n   ```'), 0, 'three spaces of indentation still open a fence');
  // A backtick line with a backtick in its info string is inline code, not a fence.
  assert.strictEqual(counted('```code``` is inline\n### Story 9.9: Example'), 1);
  assert.strictEqual(counted('`` is two backticks and no fence\n### Story 9.9: Example'), 1);
  // A line indented four spaces inside a fence does not close it.
  assert.strictEqual(counted('```md\n    ```\n### Story 9.9: Hidden\n```'), 0);
  // Inline code that opens a line is prose.
  assert.strictEqual(counted('``code`` opens this line\n### Story 9.9: Example'), 1);
  // A tilde fence is not closed by backticks, and a backtick fence is not closed by tildes.
  assert.strictEqual(counted('~~~md\n```\n### Story 9.9: Hidden\n~~~'), 0);
  assert.strictEqual(counted('```md\n~~~\n### Story 9.9: Hidden\n```'), 0);
  // Only a level-three heading is a story section.
  assert.strictEqual(counted('## Story 9.9: Level two'), 0);
  assert.strictEqual(counted('#### Story 9.9: Level four'), 0);
  assert.throws(
    () => planning.readStoryHeadings(`${epicsText}\n### Story 1.50: A second section\n`),
    /holds a second section for Story 1\.50/,
  );
  assert.throws(() => planning.readStoryHeadings(`${epicsText}\n### Story seven: no id\n`), /does not read "### Story <id>: <title>"/);
  assert.throws(() => planning.readStoryHeadings('no story section\n'), /holds no "### Story <id>: <title>" heading/);
  assert.strictEqual(planning.countEpicHeadings(epicsText), 2);
  assert.strictEqual(planning.countEpicHeadings(`${epicsText}\n## Epic 3: A third\n`), 3);
  assert.strictEqual(planning.countEpicHeadings(`${epicsText}\n\`\`\`\n## Epic 3: Inside a fence\n\`\`\`\n`), 2);
  assert.throws(() => planning.countEpicHeadings('no epic\n'), /holds no "## Epic <n>: <title>" heading/);
});

check('the appended stories are the Epic 1 sections numbered 1.27 and up', () => {
  const ids = planning.appendedStoryIds(planning.readStoryHeadings(epicsText));
  assert.ok(ids.includes('1.27') && ids.includes('1.132'));
  assert.ok(!ids.includes('1.26') && !ids.includes('1.1') && !ids.includes('2.6') && !ids.includes('H.1'));
  assert.strictEqual(ids.length, APPENDED);
  assert.deepStrictEqual(planning.expandStoryList('1.27 to 1.29, 1.31'), ['1.27', '1.28', '1.29', '1.31']);
  assert.throws(() => planning.expandStoryList('1.79 to 1.27'), /does not rise/);
  assert.throws(() => planning.expandStoryList('1.5 to 1.5'), /does not rise/);
  assert.throws(() => planning.expandStoryList('2.1'), /is not a story id or a "1\.a to 1\.b" range/);
});

const appendedProblems = (text) => planning.checkAppendedStories(text, planning.readStoryHeadings(text)).problems;
const OVERVIEW_TAIL = '1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132)';
const EPIC_LIST_TAIL = '1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132.';
const OVERVIEW_HEAD = `(${APPENDED} stories were appended to Epic 1 from findings made while building it: 1.27 to 1.79`;

check('the committed appended-story lists match the sections, the two sentences are read, and the overview count is verified', () => {
  const result = planning.checkAppendedStories(epicsText, planning.readStoryHeadings(epicsText));
  assert.deepStrictEqual(result, { problems: [], verified: APPENDED, lists: 2 });
  assert.ok(epicsText.includes(OVERVIEW_TAIL), 'fixture setup: the overview list ends as the tests expect');
  assert.ok(epicsText.includes(EPIC_LIST_TAIL), 'fixture setup: the epic list ends as the tests expect');
  assert.ok(epicsText.includes(OVERVIEW_HEAD), 'fixture setup: the overview list opens as the tests expect');
});

check('an appended story dropped from either list is named', () => {
  const overview = replaceOnce(epicsText, OVERVIEW_TAIL, '1.120, 1.121, 1.122, 1.130, 1.131, 1.132)');
  assertProblem(appendedProblems(overview), 'the overview omits the appended stories 1.123, which the file holds');
  const epicList = replaceOnce(epicsText, EPIC_LIST_TAIL, '1.120, 1.121, 1.122, 1.123, 1.130, 1.131.');
  assertProblem(appendedProblems(epicList), 'the epic list omits the appended stories 1.132, which the file holds');
  const early = replaceOnce(epicsText, OVERVIEW_HEAD, OVERVIEW_HEAD.replace('1.27 to', '1.28 to'));
  assertProblem(appendedProblems(early), 'the overview omits the appended stories 1.27, which the file holds');
});

check('an id listed with no section, a repeated id and an order slip are named', () => {
  const extra = replaceOnce(epicsText, OVERVIEW_TAIL, '1.120, 1.121, 1.122, 1.123, 1.124, 1.130, 1.131, 1.132)');
  assertProblem(
    appendedProblems(extra),
    'the overview lists 1.124, which no appended story section holds (the appended stories are 1.27 and up)',
  );
  const beyond = replaceOnce(epicsText, EPIC_LIST_TAIL, `${EPIC_LIST_TAIL.slice(0, -1)}, 1.133.`);
  assertProblem(
    appendedProblems(beyond),
    'the epic list lists 1.133, which no appended story section holds (the appended stories are 1.27 and up)',
  );
  const twice = replaceOnce(epicsText, EPIC_LIST_TAIL, '1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132, 1.132.');
  assertProblem(appendedProblems(twice), 'the epic list lists 1.132 more than once');
  const unordered = replaceOnce(epicsText, EPIC_LIST_TAIL, '1.120, 1.121, 1.122, 1.123, 1.131, 1.130, 1.132.');
  assertProblem(appendedProblems(unordered), 'the epic list lists the appended stories out of ascending order');
});

check('the overview count of appended stories is held to the sections', () => {
  const off = replaceOnce(epicsText, `(${APPENDED} stories were appended`, `(${APPENDED + 1} stories were appended`);
  assertProblem(appendedProblems(off), `the overview says ${APPENDED + 1} stories were appended and the file holds ${APPENDED}`);
});

check('an appended story section added or removed is named in both lists', () => {
  const removed = replaceOnce(epicsText, '### Story 1.50: ', '#### Story 1.50: ');
  const problems = appendedProblems(removed);
  assertProblem(problems, 'the overview lists 1.50, which no appended story section holds (the appended stories are 1.27 and up)');
  assertProblem(problems, 'the epic list lists 1.50, which no appended story section holds (the appended stories are 1.27 and up)');
  assertProblem(problems, `the overview says ${APPENDED} stories were appended and the file holds ${APPENDED - 1}`);
  const added = `${epicsText}\n### Story 1.117: A story the lists do not name\n`;
  const addedProblems = appendedProblems(added);
  assertProblem(addedProblems, 'the overview omits the appended stories 1.117, which the file holds');
  assertProblem(addedProblems, 'the epic list omits the appended stories 1.117, which the file holds');
  assertProblem(addedProblems, `the overview says ${APPENDED} stories were appended and the file holds ${APPENDED + 1}`);
});

check('a sentence that is gone or stated twice is named', () => {
  const gone = replaceOnce(epicsText, ' were appended to Epic 1 from findings made while building it', ' were added to Epic 1 later');
  assertProblem(
    appendedProblems(gone),
    `${planning.EPICS_RELATIVE} states the appended stories 0 times in the overview; the sentence has to appear exactly once`,
  );
  const listGone = replaceOnce(epicsText, ' were appended as stories at the end of the epic: Stories ', ' came later: Stories ');
  assertProblem(
    appendedProblems(listGone),
    `${planning.EPICS_RELATIVE} states the appended stories 0 times in the epic list; the sentence has to appear exactly once`,
  );
  const twice = `${epicsText}\n(${APPENDED} stories were appended to Epic 1 from findings made while building it: 1.27 to 1.79)\n`;
  assertProblem(
    appendedProblems(twice),
    `${planning.EPICS_RELATIVE} states the appended stories 2 times in the overview; the sentence has to appear exactly once`,
  );
});

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

function scratchRoot(epics, sprint) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-root-'));
  for (const [relative, text] of [
    [planning.EPICS_RELATIVE, epics],
    [planning.SPRINT_STATUS_RELATIVE, sprint],
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  return root;
}

function load(epics, sprint) {
  const root = scratchRoot(epics, sprint);
  try {
    return planning.loadPlanningSources(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

check('the loader returns the counts the checks verified, and its numbers move with the files', () => {
  assert.deepStrictEqual(load(epicsText, sprintText), {
    STORY_COUNT: STORIES,
    EPIC_COUNT: 2,
    APPENDED_STORY_COUNT: APPENDED,
    LANE_COUNT: 5,
  });
  const extraStory = `${epicsText}\n### Story 2.7: A story with no lane\n`;
  assert.strictEqual(load(extraStory, sprintText).STORY_COUNT, STORIES + 1);
  const fewer = load(withoutEpicLane(epicsText, 5), withoutSprintLane(sprintText, 5));
  assert.strictEqual(fewer.LANE_COUNT, 4);
});

check('the loader counts the appended stories it verified, so an added story with its lists and count moved changes the export', () => {
  const withSection = `${epicsText}\n### Story 1.117: A story the lists name\n`;
  const grown = replaceOnce(withSection, `(${APPENDED} stories were appended`, `(${APPENDED + 1} stories were appended`).replaceAll(
    '1.90 to 1.116, 1.120',
    '1.90 to 1.117, 1.120',
  );
  const loaded = load(grown, sprintText);
  assert.strictEqual(loaded.APPENDED_STORY_COUNT, APPENDED + 1);
  assert.strictEqual(loaded.STORY_COUNT, STORIES + 1);
});

check('the loader refuses a plan that disagrees with itself and lists every disagreement', () => {
  const epicsDrifted = withEpicLane(epicsText, 1, (held) => held.slice(1));
  const sprintDrifted = withSprintLane(sprintText, 5, (held) => held.slice(1));
  assert.throws(
    () => load(epicsDrifted, sprintDrifted),
    (error) => {
      assert.match(error.message, /the plan disagrees with itself/);
      assert.match(error.message, /Lane 5: epics\.md lists 1\.115, which sprint-status leaves out of lane-5/);
      assert.match(error.message, /Lane 1: sprint-status lists 1\.41, which epics\.md leaves out of Lane 1/);
      return true;
    },
  );
  assert.throws(() => load(epicsText, 'development_status:\n  a: b\nparallel_lanes: {}\n'), /holds no lane under parallel_lanes/);
  assert.throws(() => planning.loadPlanningSources(path.join(os.tmpdir(), 'planning-root-that-does-not-exist')), /could not be read/);
});

// ---------------------------------------------------------------------------
// The real gate over scratch trees
// ---------------------------------------------------------------------------

/**
 * A scratch repository: a directory that links every path of this repository except the ones `overrides` names, which are written as real files.
 * A value is the text of the file, or `{ copyOf }` for a copy of one of this repository's files.
 * A module that reads its own location has to live in the scratch tree.
 */
function scratchTree(overrides) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-tree-'));
  const wanted = Object.keys(overrides);
  // The replay counts read directory entries without following links, so the replay corpus keeps real directories down to its files.
  const realDirectories = path.join('test', 'replay');
  const materialize = (relativeDir) => {
    fs.mkdirSync(path.join(root, relativeDir), { recursive: true });
    for (const entry of fs.readdirSync(path.join(PROJECT_ROOT, relativeDir))) {
      const relative = path.join(relativeDir, entry);
      if (wanted.includes(relative)) continue;
      const underReplay = relative.startsWith(realDirectories + path.sep);
      const isDirectory = fs.statSync(path.join(PROJECT_ROOT, relative)).isDirectory();
      if ((underReplay && isDirectory) || wanted.some((candidate) => candidate.startsWith(relative + path.sep))) {
        materialize(relative);
      } else {
        fs.symlinkSync(path.join(PROJECT_ROOT, relative), path.join(root, relative));
      }
    }
  };
  materialize('');
  for (const [relative, value] of Object.entries(overrides)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), typeof value === 'string' ? value : read(value.copyOf));
  }
  return root;
}

const GATE_FILES = {
  'eval-quality.config.json': { copyOf: 'eval-quality.config.json' },
  'test/lib/planning-doc-sources.js': { copyOf: 'test/lib/planning-doc-sources.js' },
  'test/lib/doc-count-sources.js': { copyOf: 'test/lib/doc-count-sources.js' },
};

function runGate(extra) {
  const root = scratchTree({ ...GATE_FILES, ...extra });
  try {
    const result = spawnSync(GATE_BIN, ['doc-counts'], { cwd: root, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const readmeText = read('test/README.md');
const headerText = read('test/test-eval-replay.js');
const epicsFile = planning.EPICS_RELATIVE;
const sprintFile = planning.SPRINT_STATUS_RELATIVE;

function assertGateFails(extra, expected, message) {
  const result = runGate(extra);
  assert.notStrictEqual(result.status, 0, `${message}: the gate passed`);
  assert.match(result.output, expected, `${message}: the gate failed with another message:\n${result.output}`);
}

check('negative control: the scratch tree of the untouched files passes the gate', () => {
  const result = runGate({});
  assert.strictEqual(result.status, 0, result.output);
  assert.match(result.output, /0 disagreement\(s\)/);
});

/**
 * A sentence of `file` with one count moved: `[from, to, expected failure]`.
 * `claim` is the start of the entry's claim.
 */
function digitsDrift(file, claim, template, count, moved) {
  return [
    template(count),
    template(moved),
    new RegExp(`${escapeRegExp(file)}:\\d+: ${escapeRegExp(claim)}.*reads "${moved}" and is ${count}`),
  ];
}

function wordsDrift(file, claim, template, count, moved) {
  const [was, now] = [capital(word(count)), capital(word(moved))];
  return [
    template(was),
    template(now),
    new RegExp(`${escapeRegExp(file)}:\\d+: ${escapeRegExp(claim)}.*reads "${now}" and is ${was}`, 'i'),
  ];
}

const README = 'test/README.md';
const HEADER = 'test/test-eval-replay.js';
const REPLAY_OFF_BY_ONE = [
  digitsDrift(README, 'the replay corpus size', (n) => `Of the ${n} cases`, REPLAY.total, REPLAY.total + 1),
  digitsDrift(README, 'the replay corpus size', (n) => `${REPLAY.total} cases, ${n} produce`, REPLAY.scored, REPLAY.scored + 1),
  digitsDrift(README, 'the replay corpus size', (n) => `and ${n} of those are constructed`, REPLAY.constructed, REPLAY.constructed + 1),
  digitsDrift(README, 'the cases that carry captured bytes', (n) => `${n} cases carry captured bytes`, REPLAY.bytes, REPLAY.bytes + 1),
  digitsDrift(
    README,
    'the cases that carry captured bytes',
    (n) => `${n} from the ATDD fixture corpus`,
    REPLAY.atddBytes,
    REPLAY.atddBytes + 1,
  ),
  wordsDrift(README, 'the trace replay cases', (w) => `${w} trace cases`, REPLAY.trace, REPLAY.trace - 1),
  wordsDrift(README, 'the nfr replay cases', (w) => `${w} \`nfr\` cases`, REPLAY.nfr, REPLAY.nfr - 1),
  wordsDrift(README, 'the ci replay cases', (w) => `${w} \`ci\` cases`, REPLAY.ciFullAndMinimal, REPLAY.ciFullAndMinimal - 1),
  wordsDrift(
    README,
    'the test-review captures',
    (w) => `The ${w.toLowerCase()} test-review captures`,
    REPLAY.testReviewBytes,
    REPLAY.testReviewBytes + 1,
  ),
];

for (const [from, to, expected] of REPLAY_OFF_BY_ONE) {
  check(`test/README.md: "${from}" changed to "${to}" fails the gate`, () => {
    assertGateFails({ [README]: replaceOnce(readmeText, from, to) }, expected, 'a replay count in the README');
  });
}

for (const [from, to, expected] of [
  digitsDrift(HEADER, 'the replay corpus size', (n) => `The corpus holds ${n} cases`, REPLAY.total, REPLAY.total + 1),
  digitsDrift(HEADER, 'the replay corpus size', (n) => `${REPLAY.total} cases and ${n} of them`, REPLAY.scored, REPLAY.scored + 1),
  digitsDrift(HEADER, 'the replay corpus size', (n) => `${n} of those are constructed`, REPLAY.constructed, REPLAY.constructed + 1),
  digitsDrift(HEADER, 'the cases that carry captured bytes', (n) => `${n} cases carry captured bytes`, REPLAY.bytes, REPLAY.bytes - 1),
]) {
  check(`the replay header: "${from}" changed to "${to}" fails the gate`, () => {
    assertGateFails({ [HEADER]: replaceOnce(headerText, from, to) }, expected, 'a replay count in the header');
  });
}

const ciCasesMoved = new RegExp(
  `the ci replay cases.*reads "${capital(word(REPLAY.ciFullAndMinimal))}" and is ${capital(word(REPLAY.ciFullAndMinimal + 1))}`,
  'i',
);

check('adding a replay case without moving the totals fails the gate in every sentence that states them', () => {
  const extra = read('test/replay/ci/full-correct-pipeline/expected.json');
  const result = runGate({ 'test/replay/ci/full-zz-extra-case/expected.json': extra });
  assert.notStrictEqual(result.status, 0, 'the gate passed with one more case in the ci corpus');
  assert.match(
    result.output,
    new RegExp(String.raw`test/README\.md:\d+: the replay corpus size.*reads "${REPLAY.total}" and is ${REPLAY.total + 1}`),
  );
  assert.match(result.output, ciCasesMoved);
  assert.match(
    result.output,
    new RegExp(String.raw`test/test-eval-replay\.js:\d+: the replay corpus size.*reads "${REPLAY.total}" and is ${REPLAY.total + 1}`),
  );
});

check('a stored case whose result is unmeasurable moves the total and leaves the cases that produce a number', () => {
  const stored = JSON.parse(read('test/replay/ci/full-correct-pipeline/expected.json'));
  const unmeasurable = JSON.stringify({ ...stored, result: { unmeasurable: 'environment-parser' } });
  const result = runGate({ 'test/replay/ci/full-zz-unmeasurable/expected.json': unmeasurable });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.output, new RegExp(`the replay corpus size.*reads "${REPLAY.total}" and is ${REPLAY.total + 1}`));
  assert.doesNotMatch(
    result.output,
    new RegExp(`reads "${REPLAY.scored}" and is ${REPLAY.scored + 1}`),
    'an unmeasurable case is not a case that produces a number',
  );
});

check('a stored result of another shape than null or an object is refused, and so is an origin the counts do not know', () => {
  const stored = JSON.parse(read('test/replay/ci/full-correct-pipeline/expected.json'));
  assertGateFails(
    { 'test/replay/ci/full-zz-odd-result/expected.json': JSON.stringify({ ...stored, result: 'scored' }) },
    /stores a result of another shape/,
    'a result of another shape',
  );
  assertGateFails(
    { 'test/replay/ci/full-zz-array-result/expected.json': JSON.stringify({ ...stored, result: [] }) },
    /stores a result of another shape/,
    'a result that is an array',
  );
  assertGateFails(
    {
      'test/replay/ci/full-zz-odd-origin/expected.json': JSON.stringify({
        ...stored,
        storedOutput: { ...stored.storedOutput, origin: 'remembered' },
      }),
    },
    /names the origin "remembered"/,
    'an origin the counts do not know',
  );
});

check('only a ci case over the full or minimal project moves the count of ci cases that README states for those projects', () => {
  const stored = JSON.parse(read('test/replay/ci/full-correct-pipeline/expected.json'));
  const withFixtureSet = (fixtureSet) => ({
    'test/replay/ci/zz-extra-case/expected.json': JSON.stringify({ ...stored, inputs: { ...stored.inputs, fixtureSet } }),
  });
  assert.match(runGate(withFixtureSet('full-extra-project')).output, ciCasesMoved);
  assert.match(runGate(withFixtureSet('minimal-extra-project')).output, ciCasesMoved);
  assert.doesNotMatch(runGate(withFixtureSet('fullstack-extra-project')).output, /the ci replay cases/);
  assert.doesNotMatch(runGate(withFixtureSet('evaluation-extra-project')).output, /the ci replay cases/);
});

for (const [from, to, expected] of [
  [
    `into two epics and ${STORIES} stories`,
    `into two epics and ${STORIES + 1} stories`,
    new RegExp(`epics\\.md:\\d+: the story count of the overview.*reads "${STORIES + 1}" and is ${STORIES}`),
  ],
  [
    `into two epics and ${STORIES} stories`,
    `into two epics and ${STORIES - 1} stories`,
    new RegExp(`epics\\.md:\\d+: the story count of the overview.*reads "${STORIES - 1}" and is ${STORIES}`),
  ],
  [
    `into ${word(planning.EPIC_COUNT)} epics and`,
    `into ${word(planning.EPIC_COUNT + 1)} epics and`,
    new RegExp(
      `epics\\.md:\\d+: the epic count of the overview.*reads "${word(planning.EPIC_COUNT + 1)}" and is ${word(planning.EPIC_COUNT)}`,
      'i',
    ),
  ],
  [
    `(${APPENDED} stories were appended`,
    `(${APPENDED - 1} stories were appended`,
    new RegExp(`the overview says ${APPENDED - 1} stories were appended and the file holds ${APPENDED}`),
  ],
  [
    `run in ${word(planning.LANE_COUNT)} parallel lanes`,
    `run in ${word(planning.LANE_COUNT - 1)} parallel lanes`,
    new RegExp(
      `epics\\.md:\\d+: how many parallel lanes.*reads "${word(planning.LANE_COUNT - 1)}" and is ${word(planning.LANE_COUNT)}`,
      'i',
    ),
  ],
]) {
  check(`epics.md: "${from}" changed to "${to}" fails the gate`, () => {
    assertGateFails({ [epicsFile]: replaceOnce(epicsText, from, to) }, expected, 'a count of the overview');
  });
}

check('epics.md: the overview range with one story left out fails the gate', () => {
  assertGateFails(
    { [epicsFile]: replaceOnce(epicsText, OVERVIEW_TAIL, '1.120, 1.121, 1.122, 1.130, 1.131, 1.132)') },
    /the overview omits the appended stories 1\.123, which the file holds/,
    'a story left out of the appended range',
  );
});

check('epics.md: a story section added without moving the overview count fails the gate', () => {
  assertGateFails(
    { [epicsFile]: `${epicsText}\n### Story 2.7: A story the overview does not count\n` },
    new RegExp(`epics\\.md:\\d+: the story count of the overview.*reads "${STORIES}" and is ${STORIES + 1}`),
    'a story section added',
  );
});

for (const lane of LANES) {
  check(`gate: an entry removed from lane ${lane} of epics.md fails the gate`, () => {
    const items = epicItems(lane);
    const middle = Math.floor(items.length / 2);
    const id = plain(items[middle]);
    assertGateFails(
      { [epicsFile]: withEpicLane(epicsText, lane, (held) => held.filter((_item, index) => index !== middle)) },
      new RegExp(
        String.raw`Lane ${lane}: sprint-status lists ${id.replace('.', String.raw`\.`)}, which epics\.md leaves out of Lane ${lane}`,
      ),
      `an entry removed from Lane ${lane}`,
    );
  });
}

check('gate: a story moved to another lane in sprint-status.yaml only fails the gate', () => {
  const entries = sprintEntries(4);
  const moved = withSprintLane(
    withSprintLane(sprintText, 4, (held) => held.slice(0, -1)),
    5,
    (held) => [...held, entries.at(-1)],
  );
  assertGateFails(
    { [sprintFile]: moved },
    /Lane 4: epics\.md lists 1\.95, which sprint-status leaves out of lane-4/,
    'a story moved in one file',
  );
});

check('gate: a story duplicated across two lanes fails the gate', () => {
  assertGateFails(
    { [epicsFile]: withEpicLane(epicsText, 2, (held) => [...held, '1.95']) },
    /epics\.md puts Story 1\.95 in lanes 2 and 4/,
    'a story in two lanes',
  );
});

check('gate: an order swap inside a lane fails the gate', () => {
  assertGateFails(
    { [sprintFile]: withSprintLane(sprintText, 3, (held) => swap(held, 0, 1)) },
    /Lane 3: the order differs from position 1, where epics\.md has 1\.45 and sprint-status has 2\.1/,
    'an order swap',
  );
});

check('gate: a lane missing from either file fails the gate', () => {
  assertGateFails(
    { [epicsFile]: withoutEpicLane(epicsText, 5) },
    /sprint-status has lane-5 and epics\.md has no Lane 5 paragraph/,
    'Lane 5 gone from epics.md',
  );
  assertGateFails(
    { [sprintFile]: withoutSprintLane(sprintText, 5) },
    /epics\.md has Lane 5 and sprint-status has no lane-5 list/,
    'lane-5 gone from sprint-status',
  );
});

check('gate: the fifth lane gone from both files fails the sentence that says five', () => {
  assertGateFails(
    { [epicsFile]: withoutEpicLane(epicsText, 5), [sprintFile]: withoutSprintLane(sprintText, 5) },
    new RegExp(`how many parallel lanes.*reads "${word(planning.LANE_COUNT)}" and is ${word(planning.LANE_COUNT - 1)}`, 'i'),
    'five lanes narrowed to four',
  );
});

// ---------------------------------------------------------------------------
// The configuration
// ---------------------------------------------------------------------------

// The doc-counts entries and sources that existed before Story 1.95, as origin/main held them: what each entry reads and what each source returns.
// A pinned entry that reads another source, and a pinned source that exports another value, fails the check that holds them.
const PRE_EXISTING_ENTRIES = [
  {
    file: 'docs/explanation/eval-quality-roadmap.md',
    claim: 'the per-suite call counts one eval:all run makes',
    counts: [
      'fragmentSelectionCalls',
      'routingIntentCalls',
      'testDesignCalls',
      'testReviewCalls',
      'nfrCalls',
      'ciCalls',
      'traceCalls',
      'atddCalls',
    ],
  },
  { file: 'README.md', claim: 'the fragment-selection case count', counts: ['fragmentSelectionCases'] },
  {
    file: 'README.md',
    claim: 'how many suites a preflight run checks in total, and how many of them get a real agent-preflight probe',
    counts: ['agentPreflightedSuiteCount', 'totalSuiteCount'],
  },
  { file: 'README.md', claim: 'the npm test chain length', counts: ['npmTestChainLength', 'npmTestChainLength'] },
  {
    file: 'README.md',
    claim: 'the knowledge-fragment tier breakdown',
    counts: ['knowledgeFragmentTotal', 'knowledgeFragmentCore', 'knowledgeFragmentExtended', 'knowledgeFragmentSpecialized'],
  },
  {
    file: 'docs/explanation/eval-quality-adoption-guide.md',
    claim: "one eval:all run's total model calls and their per-suite breakdown",
    counts: [
      'totalCalls',
      'fragmentSelectionCalls',
      'routingIntentCalls',
      'testDesignCalls',
      'testReviewCalls',
      'nfrCalls',
      'ciCalls',
      'traceCalls',
      'atddCalls',
    ],
  },
  {
    file: 'README.md',
    claim: "one eval:all run's total agent calls and all three built-in runners' total",
    counts: [
      'totalCalls',
      'fragmentSelectionCalls',
      'routingIntentCalls',
      'testReviewCalls',
      'nfrCalls',
      'ciCalls',
      'testDesignCalls',
      'traceCalls',
      'atddCalls',
      'totalCallsThreeRunners',
    ],
  },
  {
    file: 'docs/reference/tea-test-review-cli.md',
    claim: 'the Advisory Observations cap on advisoryObservations',
    counts: ['advisoryObservationsMaxItems'],
  },
  {
    file: 'docs/explanation/eval-quality-adoption-guide.md',
    claim: 'the replay corpus row: the stored output total and its per-suite breakdown',
    counts: [
      'replayTotal',
      'replayFragmentSelection',
      'replayAtdd',
      'replayTestReview',
      'replayTrace',
      'replayNfr',
      'replayCi',
      'replayTestDesign',
      'replayRouting',
    ],
  },
  { file: 'docs/explanation/eval-quality-adoption-guide.md', claim: "the replay section's stored output total", counts: ['replayTotal'] },
  {
    file: 'docs/explanation/eval-quality-adoption-guide.md',
    claim: 'how many stored outputs are real captures, captured and constructed',
    counts: ['replayRealCaptures', 'replayTotal', 'replayCaptured', 'replayConstructed'],
  },
  {
    file: 'docs/explanation/eval-quality-roadmap.md',
    claim: 'the replay corpus size and its per-suite breakdown',
    counts: [
      'replayTotal',
      'replayFragmentSelection',
      'replayAtdd',
      'replayTestReview',
      'replayTestDesign',
      'replayTrace',
      'replayRouting',
      'replayNfr',
      'replayCi',
    ],
  },
  {
    file: 'docs/explanation/eval-quality-roadmap.md',
    claim: 'how many stored outputs are real captures, captured and constructed',
    counts: ['replayRealCaptures', 'replayTotal', 'replayCaptured', 'replayConstructed'],
  },
];

const PRE_EXISTING_SOURCES = {
  totalCalls: 'TOTAL_CALLS',
  totalCallsThreeRunners: 'TOTAL_CALLS_THREE_RUNNERS',
  fragmentSelectionCalls: 'FRAGMENT_SELECTION_CALLS',
  routingIntentCalls: 'ROUTING_INTENT_CALLS',
  testDesignCalls: 'TEST_DESIGN_CALLS',
  testReviewCalls: 'TEST_REVIEW_CALLS',
  nfrCalls: 'NFR_CALLS',
  traceCalls: 'TRACE_CALLS',
  ciCalls: 'CI_CALLS',
  atddCalls: 'ATDD_CALLS',
  fragmentSelectionCases: 'FRAGMENT_SELECTION_CASES',
  totalSuiteCount: 'TOTAL_SUITE_COUNT',
  agentPreflightedSuiteCount: 'AGENT_PREFLIGHTED_SUITE_COUNT',
  npmTestChainLength: 'NPM_TEST_CHAIN_LENGTH',
  knowledgeFragmentTotal: 'KNOWLEDGE_FRAGMENT_TOTAL',
  knowledgeFragmentCore: 'KNOWLEDGE_FRAGMENT_CORE',
  knowledgeFragmentExtended: 'KNOWLEDGE_FRAGMENT_EXTENDED',
  knowledgeFragmentSpecialized: 'KNOWLEDGE_FRAGMENT_SPECIALIZED',
  advisoryObservationsMaxItems: 'ADVISORY_OBSERVATIONS_MAX_ITEMS',
  replayTotal: 'REPLAY_TOTAL',
  replayFragmentSelection: 'REPLAY_FRAGMENT_SELECTION',
  replayAtdd: 'REPLAY_ATDD',
  replayTestReview: 'REPLAY_TEST_REVIEW',
  replayTestDesign: 'REPLAY_TEST_DESIGN',
  replayTrace: 'REPLAY_TRACE',
  replayRouting: 'REPLAY_ROUTING',
  replayNfr: 'REPLAY_NFR',
  replayCi: 'REPLAY_CI',
  replayRealCaptures: 'REPLAY_REAL_CAPTURES',
  replayCaptured: 'REPLAY_CAPTURED',
  replayConstructed: 'REPLAY_CONSTRUCTED',
};

/** What a configuration's `doc-counts` section does to the entries and sources that existed before Story 1.95. */
function preExistingProblems(config) {
  const section = config['doc-counts'];
  const problems = [];
  for (const [index, pinned] of PRE_EXISTING_ENTRIES.entries()) {
    const entry = section.entries[index];
    if (!entry || entry.file !== pinned.file || entry.claim !== pinned.claim) {
      problems.push(`entry ${index + 1} is another entry than "${pinned.claim}" of ${pinned.file}`);
    } else if (JSON.stringify(entry.counts) !== JSON.stringify(pinned.counts)) {
      problems.push(`"${pinned.claim}" of ${pinned.file} reads ${entry.counts.join(', ')} and read ${pinned.counts.join(', ')}`);
    }
  }
  for (const [name, exported] of Object.entries(PRE_EXISTING_SOURCES)) {
    const source = section.sources[name];
    if (
      !source ||
      source.kind !== 'module' ||
      source.from.module !== 'test/lib/doc-count-sources.js' ||
      source.from.export !== exported ||
      source.from.path
    ) {
      problems.push(`source ${name} returns another export than ${exported} of test/lib/doc-count-sources.js`);
    }
  }
  return problems;
}

check('every doc-counts entry and source that existed before Story 1.95 reads what it read, and a widened one is named', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert.deepStrictEqual(preExistingProblems(config), []);
  assert.strictEqual(PRE_EXISTING_ENTRIES.length, 13);
  assert.strictEqual(Object.keys(PRE_EXISTING_SOURCES).length, 31);
  const widened = structuredClone(config);
  const adoption = widened['doc-counts'].entries.find((entry) => entry.claim === "the replay section's stored output total");
  adoption.counts = ['replayScored'];
  assert.deepStrictEqual(preExistingProblems(widened), [
    `"the replay section's stored output total" of docs/explanation/eval-quality-adoption-guide.md reads replayScored and read replayTotal`,
  ]);
  const retargeted = structuredClone(config);
  retargeted['doc-counts'].sources.replayTotal.from.export = 'REPLAY_SCORED';
  assert.deepStrictEqual(preExistingProblems(retargeted), [
    'source replayTotal returns another export than REPLAY_TOTAL of test/lib/doc-count-sources.js',
  ]);
  const moved = structuredClone(config);
  moved['doc-counts'].entries.splice(0, 1);
  assert.ok(preExistingProblems(moved).length > 0, 'an entry removed or reordered is named');
  const extraCounts = structuredClone(config);
  extraCounts['doc-counts'].entries[1].counts.push('replayTotal');
  assert.strictEqual(preExistingProblems(extraCounts).length, 1, 'an entry that reads one more source is named');
});

check('each new entry holds its sentence against the sources in the order its capture groups carry them', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const entries = config['doc-counts'].entries;
  const find = (file, claim) => {
    const found = entries.filter((entry) => entry.file === file && entry.claim.startsWith(claim));
    assert.strictEqual(found.length, 1, `${file} holds ${found.length} entries for "${claim}"`);
    return found[0];
  };

  const sizeOrder = ['replayTotal', 'replayScored', 'replayScoredConstructed'];
  assert.deepStrictEqual(find('test/README.md', 'the replay corpus size').counts, sizeOrder);
  assert.deepStrictEqual(find('test/test-eval-replay.js', 'the replay corpus size').counts, sizeOrder);
  assert.deepStrictEqual(find('test/README.md', 'the cases that carry captured bytes').counts, [
    'replayCapturedBytes',
    'replayAtddCapturedBytes',
    'replayTestReviewCapturedBytes',
    'replayCiCapturedBytes',
  ]);
  assert.deepStrictEqual(find('test/test-eval-replay.js', 'the cases that carry captured bytes').counts, ['replayCapturedBytes']);
  assert.deepStrictEqual(find(epicsFile, 'the story count').counts, ['storyCount']);
  assert.deepStrictEqual(find(epicsFile, 'the epic count').counts, ['epicCount']);
  assert.deepStrictEqual(find(epicsFile, 'how many stories were appended').counts, ['appendedStoryCount']);
  assert.deepStrictEqual(find(epicsFile, 'how many parallel lanes').counts, ['laneCount']);

  const sources = config['doc-counts'].sources;
  assert.deepStrictEqual(sources.storyCount.from, { module: 'test/lib/planning-doc-sources.js', export: 'STORY_COUNT' });
  assert.deepStrictEqual(sources.laneCount.from, { module: 'test/lib/planning-doc-sources.js', export: 'LANE_COUNT' });
});

if (failures.length > 0) {
  console.error('\nplanning-doc-sources validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `planning-doc-sources: ${checks} checks held the replay totals, the story count, the appended stories and the five lane lists.`,
);
