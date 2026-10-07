/**
 * TEA's own answers for the `doc-counts` gate about the Evaluate plan.
 * They are the story count and the appended-story list in the overview of `epics.md`, the lane count in its parallel-lanes section,
 * and the five lane lists that `epics.md` and `sprint-status.yaml` each carry.
 *
 * Each number comes from the committed files themselves.
 * Loading this module reads `epics.md` and `sprint-status.yaml`.
 * It refuses, naming every disagreement, when the two lists of any lane differ, when a story sits in two lanes or twice in one, when a lane entry has no status row,
 * or when the appended-story lists of the overview do not match the story sections the file holds.
 * The gate then holds the sentences that state the totals against the values returned here.
 *
 * THE RULES
 *
 * Story count.
 * A story section is a `### Story <id>: <title>` heading outside a fenced block.
 * The overview's story count is the number of those headings, H.1 included, whatever epic section holds them.
 * An id appears once.
 *
 * Epic count.
 * An epic section is a `## Epic <n>: <title>` heading outside a fenced block.
 *
 * Fenced blocks.
 * A fence opens on a line indented up to three spaces that starts with three or more backticks (no backtick in the rest of the line) or three or more tildes.
 * It closes on a line indented up to three spaces that holds only the same character, at least as many times as the opening, and whitespace.
 *
 * Appended stories.
 * Stories 1.1 to 1.26 are the original plan and the 2026-09-23 amendment.
 * Every Epic 1 story numbered 1.27 or higher was appended from a finding made while building.
 * The two lists in `epics.md` (the overview parenthesis and the Epic 1 line of the epic list) name those stories as `1.a to 1.b` ranges and single ids.
 * Both lists, expanded, equal the set of appended story sections, with each id listed once and in ascending order.
 * The overview states how many stories that is.
 *
 * Lanes.
 * `epics.md` gives each lane as a `**Lane <n>: <title>** (<where>):` paragraph that opens with a comma-separated list of story ids, a note in parentheses allowed after an id.
 * `sprint-status.yaml` gives each lane as a `parallel_lanes.lane-<n>-<slug>` list of full row keys.
 * A row key maps to the id its `<epic>-<story>-` prefix spells, so `1-93-prove-...` is Story 1.93.
 * Both files hold the same lane numbers, the same stories in each lane in the same order, no story twice (in one lane or in two), and a status row in `development_status` for every entry, under the exact key the lane lists.
 * Every id of an `epics.md` lane maps to exactly one status row.
 *
 * Every check returns the problems it found.
 * The loader collects them, and each export it returns is computed by the check that verified it.
 * A check that nobody calls leaves its export undefined, and the sentence that holds that export fails.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const YAML = require('yaml');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const EPICS_RELATIVE = '_bmad-output/planning-artifacts/evaluate/epics.md';
const SPRINT_STATUS_RELATIVE = '_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml';

/**
 * The first Epic 1 story that was appended from a finding.
 * Stories 1.17 to 1.26 came from the 2026-09-23 amendment.
 */
const FIRST_APPENDED_STORY = 27;

function refuse(message) {
  throw new Error(`planning-doc-sources: ${message}`);
}

/**
 * The lines of a markdown text that sit outside a fenced block, with their 1-based numbers.
 * Fences follow CommonMark: the opening line fixes the character and the run length, and only a line of that character at least as long closes it.
 */
function proseLines(text) {
  const lines = [];
  let fence = null;
  for (const [index, line] of text.split('\n').entries()) {
    if (fence === null) {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
        fence = { character: opening[1][0], length: opening[1].length };
        continue;
      }
      lines.push({ number: index + 1, text: line });
      continue;
    }
    const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
    if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) fence = null;
  }
  return lines;
}

const STORY_ID = String.raw`\d+\.\d+`;

/** A level-three heading that opens with `Story`; the optional group holds a readable `<id>: <title>`. */
const STORY_HEADING = /^### Story\b(?: (H\.\d+|\d+\.\d+): (.+)$)?/;

/**
 * Every story section of `epics.md` in file order, as `{ id, title, line }`.
 * Refuses a heading it cannot read and an id held twice.
 */
function readStoryHeadings(epicsText) {
  const headings = [];
  const seen = new Map();
  for (const { number, text } of proseLines(epicsText)) {
    const match = STORY_HEADING.exec(text);
    if (!match) continue;
    if (match[1] === undefined)
      refuse(`${EPICS_RELATIVE}:${number} is a story heading that does not read "### Story <id>: <title>": ${text}`);
    if (seen.has(match[1])) {
      refuse(`${EPICS_RELATIVE}:${number} holds a second section for Story ${match[1]}, first held at line ${seen.get(match[1])}`);
    }
    seen.set(match[1], number);
    headings.push({ id: match[1], title: match[2], line: number });
  }
  if (headings.length === 0) refuse(`${EPICS_RELATIVE} holds no "### Story <id>: <title>" heading`);
  return headings;
}

/** The number of `## Epic <n>: <title>` sections. */
function countEpicHeadings(epicsText) {
  const epics = proseLines(epicsText).filter(({ text }) => /^## Epic \d+: /.test(text));
  if (epics.length === 0) refuse(`${EPICS_RELATIVE} holds no "## Epic <n>: <title>" heading`);
  return epics.length;
}

/** The ids of the stories that were appended to Epic 1: `1.<n>` with `<n>` at or above `FIRST_APPENDED_STORY`. */
function appendedStoryIds(headings) {
  return headings
    .map(({ id }) => /^1\.(\d+)$/.exec(id))
    .filter((match) => match !== null && Number(match[1]) >= FIRST_APPENDED_STORY)
    .map((match) => `1.${match[1]}`);
}

const NUMBERED_ONE = String.raw`1\.\d+`;
const LIST_ITEM = String.raw`${NUMBERED_ONE}(?: to ${NUMBERED_ONE})?`;
const ITEM_LIST = String.raw`(${LIST_ITEM}(?:, ${LIST_ITEM})*)`;

/** The two sentences that name the appended stories, each with the one capture group that holds its list. */
const APPENDED_SENTENCES = [
  {
    name: 'the overview',
    pattern: new RegExp(String.raw`\((\d+) stories were appended to Epic 1 from findings made while building it: ${ITEM_LIST}\)`, 'g'),
    countGroup: 1,
    listGroup: 2,
  },
  {
    name: 'the epic list',
    pattern: new RegExp(String.raw`were appended as stories at the end of the epic: Stories ${ITEM_LIST}\.`, 'g'),
    countGroup: null,
    listGroup: 1,
  },
];

/** `1.27 to 1.79, 1.120, 1.121` as the ids it names, in the order written. */
function expandStoryList(listText) {
  const ids = [];
  for (const item of listText.split(', ')) {
    const range = /^1\.(\d+)(?: to 1\.(\d+))?$/.exec(item);
    if (!range) refuse(`"${item}" is not a story id or a "1.a to 1.b" range`);
    const low = Number(range[1]);
    const high = range[2] === undefined ? low : Number(range[2]);
    if (high < low || (range[2] !== undefined && high === low)) refuse(`the range "${item}" does not rise`);
    for (let number = low; number <= high; number += 1) ids.push(`1.${number}`);
  }
  return ids;
}

/**
 * Holds the appended-story sentences against the story sections.
 *
 * @returns {{ problems: string[], verified: number, lists: number }} `verified` is the number of appended stories the
 *   overview's list was checked against; `lists` is how many sentences were found and read.
 */
function checkAppendedStories(epicsText, headings) {
  const problems = [];
  const expected = appendedStoryIds(headings);
  const heldText = proseLines(epicsText)
    .map(({ text }) => text)
    .join('\n');
  let verified = 0;
  let lists = 0;
  for (const sentence of APPENDED_SENTENCES) {
    const matches = [...heldText.matchAll(sentence.pattern)];
    if (matches.length !== 1) {
      problems.push(
        `${EPICS_RELATIVE} states the appended stories ${matches.length} times in ${sentence.name}; the sentence has to appear exactly once`,
      );
      continue;
    }
    lists += 1;
    const listed = expandStoryList(matches[0][sentence.listGroup]);
    const duplicated = listed.filter((id, index) => listed.indexOf(id) !== index);
    if (duplicated.length > 0) problems.push(`${sentence.name} lists ${[...new Set(duplicated)].join(', ')} more than once`);
    const ascending = listed.every((id, index) => index === 0 || Number(id.slice(2)) > Number(listed[index - 1].slice(2)));
    if (!ascending) problems.push(`${sentence.name} lists the appended stories out of ascending order`);
    const missing = expected.filter((id) => !listed.includes(id));
    if (missing.length > 0) problems.push(`${sentence.name} omits the appended stories ${missing.join(', ')}, which the file holds`);
    const extra = listed.filter((id) => !expected.includes(id));
    if (extra.length > 0) {
      problems.push(
        `${sentence.name} lists ${extra.join(', ')}, which no appended story section holds (the appended stories are 1.${FIRST_APPENDED_STORY} and up)`,
      );
    }
    if (sentence.countGroup !== null) {
      const stated = Number(matches[0][sentence.countGroup]);
      if (stated !== expected.length)
        problems.push(`${sentence.name} says ${stated} stories were appended and the file holds ${expected.length}`);
      verified = expected.length;
    }
  }
  return { problems, verified, lists };
}

const LANE_ITEM = String.raw`${STORY_ID}(?: \([^)\n]*\))?`;
const LANE_PARAGRAPH = new RegExp(String.raw`^\*\*Lane (\d+): [^*\n]+\*\*(?: \([^)\n]*\))?: (${LANE_ITEM}(?:, ${LANE_ITEM})*)\.(?: |$)`);

/** The ids of a lane list, one per item, with the parenthetical note an item may carry left out. */
function laneIds(list) {
  const ids = [];
  let rest = list;
  while (rest.length > 0) {
    const item = /^(\d+\.\d+)(?: \([^)\n]*\))?(?:, |$)/.exec(rest);
    if (item === null) refuse(`${EPICS_RELATIVE} holds a lane list that stops reading at "${rest}"`);
    ids.push(item[1]);
    rest = rest.slice(item[0].length);
  }
  return ids;
}

/**
 * The lanes of `epics.md` as a map from lane number to the story ids in the order written.
 * Refuses a lane paragraph it cannot read.
 */
function readEpicLanes(epicsText) {
  const lanes = new Map();
  for (const { number, text } of proseLines(epicsText)) {
    const opening = /^\*\*Lane (\d+):/.exec(text);
    if (!opening) continue;
    const match = LANE_PARAGRAPH.exec(text);
    if (!match) refuse(`${EPICS_RELATIVE}:${number} opens Lane ${opening[1]} without a colon-delimited list of story ids`);
    const lane = Number(match[1]);
    if (lanes.has(lane)) refuse(`${EPICS_RELATIVE}:${number} opens Lane ${lane} a second time`);
    lanes.set(lane, laneIds(match[2]));
  }
  if (lanes.size === 0) refuse(`${EPICS_RELATIVE} holds no "**Lane <n>: <title>**" paragraph`);
  return lanes;
}

/** The lane lists and the status rows of `sprint-status.yaml`: `{ lanes: Map<number, string[]>, rows: string[] }`. */
function readSprintLanes(yamlText) {
  const parsed = YAML.parse(yamlText);
  const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isMap(parsed) || !isMap(parsed.development_status)) refuse(`${SPRINT_STATUS_RELATIVE} holds no development_status map`);
  if (!isMap(parsed.parallel_lanes)) refuse(`${SPRINT_STATUS_RELATIVE} holds no parallel_lanes map`);
  const lanes = new Map();
  for (const [key, entries] of Object.entries(parsed.parallel_lanes)) {
    const match = /^lane-(\d+)-/.exec(key);
    if (!match) refuse(`${SPRINT_STATUS_RELATIVE} names the lane key "${key}", which does not read lane-<n>-<slug>`);
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
      refuse(`${SPRINT_STATUS_RELATIVE} lane "${key}" is not a list of row keys`);
    }
    const lane = Number(match[1]);
    if (lanes.has(lane)) refuse(`${SPRINT_STATUS_RELATIVE} holds lane ${lane} under two keys`);
    lanes.set(lane, entries);
  }
  if (lanes.size === 0) refuse(`${SPRINT_STATUS_RELATIVE} holds no lane under parallel_lanes`);
  return { lanes, rows: Object.keys(parsed.development_status) };
}

/** `1-93-prove-the-merge` as `1.93`, or null for a key with no `<epic>-<story>-` prefix. */
function storyIdOfRow(key) {
  const match = /^(\d+)-(\d+)-/.exec(key);
  return match ? `${match[1]}.${match[2]}` : null;
}

/** Whether an id sits in two lanes, or twice in one, across a map of lane lists. */
function repeatedStories(lanes) {
  const homes = new Map();
  for (const [lane, ids] of lanes) {
    for (const id of ids) homes.set(id, [...(homes.get(id) ?? []), lane]);
  }
  return [...homes].filter(([, held]) => held.length > 1).map(([id, held]) => ({ id, held }));
}

const where = (held) => (new Set(held).size === 1 ? `lane ${held[0]} twice` : `lanes ${held.join(' and ')}`);

/**
 * Holds the lane lists of `epics.md` against `parallel_lanes` of
 * `sprint-status.yaml`.
 *
 * @returns {{ problems: string[], lanes: number, stories: number }} `lanes` is the number of lanes compared and
 *   `stories` the number of lane entries compared.
 */
function checkLanes(epicLanes, sprint) {
  const problems = [];
  const sprintIds = new Map();
  const rowKeys = new Set(sprint.rows);

  for (const [lane, entries] of sprint.lanes) {
    const ids = [];
    for (const entry of entries) {
      const id = storyIdOfRow(entry);
      if (id === null) problems.push(`sprint-status lane ${lane} lists "${entry}", which has no <epic>-<story>- prefix`);
      else ids.push(id);
      if (!rowKeys.has(entry)) problems.push(`sprint-status lane ${lane} lists "${entry}", which has no row under development_status`);
    }
    sprintIds.set(lane, ids);
  }

  for (const { id, held } of repeatedStories(epicLanes)) problems.push(`epics.md puts Story ${id} in ${where(held)}`);
  for (const { id, held } of repeatedStories(sprintIds)) problems.push(`sprint-status puts Story ${id} in ${where(held)}`);

  for (const [lane] of epicLanes) {
    if (!sprintIds.has(lane)) problems.push(`epics.md has Lane ${lane} and sprint-status has no lane-${lane} list`);
  }
  for (const [lane] of sprintIds) {
    if (!epicLanes.has(lane)) problems.push(`sprint-status has lane-${lane} and epics.md has no Lane ${lane} paragraph`);
  }

  const numbers = [...new Set([...epicLanes.keys(), ...sprintIds.keys()])].sort((left, right) => left - right);
  if (numbers.some((lane, index) => lane !== index + 1)) {
    problems.push(`the lanes are numbered ${numbers.join(', ')}; they have to run 1 to ${numbers.length} with no gap`);
  }

  let lanes = 0;
  let stories = 0;
  for (const lane of numbers) {
    if (!epicLanes.has(lane) || !sprintIds.has(lane)) continue;
    const inEpics = epicLanes.get(lane);
    const inSprint = sprintIds.get(lane);
    lanes += 1;
    stories += inEpics.length;
    const missingFromSprint = inEpics.filter((id) => !inSprint.includes(id));
    const missingFromEpics = inSprint.filter((id) => !inEpics.includes(id));
    if (missingFromSprint.length > 0)
      problems.push(`Lane ${lane}: epics.md lists ${missingFromSprint.join(', ')}, which sprint-status leaves out of lane-${lane}`);
    if (missingFromEpics.length > 0)
      problems.push(`Lane ${lane}: sprint-status lists ${missingFromEpics.join(', ')}, which epics.md leaves out of Lane ${lane}`);
    if (missingFromSprint.length === 0 && missingFromEpics.length === 0 && inEpics.join(' ') !== inSprint.join(' ')) {
      const at = inEpics.findIndex((id, index) => id !== inSprint[index]);
      problems.push(
        `Lane ${lane}: the order differs from position ${at + 1}, where epics.md has ${inEpics[at]} and sprint-status has ${inSprint[at]}`,
      );
    }
  }

  for (const [lane, ids] of epicLanes) {
    for (const id of ids) {
      const rows = sprint.rows.filter((key) => storyIdOfRow(key) === id);
      if (rows.length !== 1)
        problems.push(`Lane ${lane}: Story ${id} maps to ${rows.length} status rows, and it has to map to exactly one`);
    }
  }

  return { problems, lanes, stories };
}

/**
 * Reads the two files under `root` and returns the verified values.
 *
 * @param {string} [root] The repository root; scratch copies pass their own.
 * @returns {{ STORY_COUNT: number, EPIC_COUNT: number, APPENDED_STORY_COUNT: number, LANE_COUNT: number }}
 */
function loadPlanningSources(root = PROJECT_ROOT) {
  const read = (relative) => {
    try {
      return fs.readFileSync(path.join(root, relative), 'utf8');
    } catch (error) {
      return refuse(`${relative} could not be read: ${error.message}`);
    }
  };
  const epicsText = read(EPICS_RELATIVE);
  const sprintText = read(SPRINT_STATUS_RELATIVE);

  const headings = readStoryHeadings(epicsText);
  const epicCount = countEpicHeadings(epicsText);
  const appended = checkAppendedStories(epicsText, headings);
  const lanes = checkLanes(readEpicLanes(epicsText), readSprintLanes(sprintText));

  const problems = [...appended.problems, ...lanes.problems];
  if (problems.length > 0) refuse(`the plan disagrees with itself:\n- ${problems.join('\n- ')}`);
  if (appended.lists !== APPENDED_SENTENCES.length)
    refuse(`read ${appended.lists} of ${APPENDED_SENTENCES.length} appended-story sentences`);
  if (lanes.lanes === 0 || lanes.stories === 0) refuse('compared no lane');

  return {
    STORY_COUNT: headings.length,
    EPIC_COUNT: epicCount,
    APPENDED_STORY_COUNT: appended.verified,
    LANE_COUNT: lanes.lanes,
  };
}

// Named assignments, since the gate's loader reads a CommonJS module's exports from its source text.
const planning = loadPlanningSources();
exports.STORY_COUNT = planning.STORY_COUNT;
exports.EPIC_COUNT = planning.EPIC_COUNT;
exports.APPENDED_STORY_COUNT = planning.APPENDED_STORY_COUNT;
exports.LANE_COUNT = planning.LANE_COUNT;

exports.FIRST_APPENDED_STORY = FIRST_APPENDED_STORY;
exports.loadPlanningSources = loadPlanningSources;
exports.readStoryHeadings = readStoryHeadings;
exports.countEpicHeadings = countEpicHeadings;
exports.appendedStoryIds = appendedStoryIds;
exports.expandStoryList = expandStoryList;
exports.checkAppendedStories = checkAppendedStories;
exports.readEpicLanes = readEpicLanes;
exports.readSprintLanes = readSprintLanes;
exports.checkLanes = checkLanes;
exports.EPICS_RELATIVE = EPICS_RELATIVE;
exports.SPRINT_STATUS_RELATIVE = SPRINT_STATUS_RELATIVE;
