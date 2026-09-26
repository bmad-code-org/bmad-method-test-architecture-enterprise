#!/usr/bin/env node
/**
 * A stand-in workflow target for `tea-evaluate` (Story 1.18): a record store
 * whose `create` operation mints a fresh identifier on every run and whose
 * `read` operation takes one back, so a plan can only read back the record it
 * created by binding the identifier `create` returned.
 *
 *   records.js create        reads the record's title from standard input,
 *                            mints rec-<random UUID>, writes store/<id>.json
 *                            in its working directory and prints
 *                            {"id","title","path"} as JSON
 *   records.js read --id X   prints {"found":true,"id","title"} for
 *                            store/X.json, or {"found":false,"id"} when no
 *                            such record exists or no id is given
 *
 * Both exit 0. The mutation M-001 plants makes `create` store the record
 * under another fresh identifier than the one it prints, so a read of the
 * printed identifier finds nothing, and `path` names the file it did write.
 *
 * When RECORDS_LOG names a file, every run first appends one JSON line to it:
 * the operation, the workspace it runs in by the runtime's label (trial-clean-2
 * for tea-evaluate-trial-clean-2-XXXXXX, null elsewhere) and the identifier a
 * read was given. When RECORDS_OMIT_ID names workspace labels, separated by
 * commas, `create` leaves the identifier out of what it prints in those
 * workspaces, as a target whose answer lacks the value a later step captures.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STORE = 'store';
/** An identifier a read may name: letters, digits and hyphens, so no identifier leaves the store. */
const IDENTIFIER = /^[A-Za-z0-9-]+$/;

const [operation, ...rest] = process.argv.slice(2);
const workspaceDirectory = path.basename(path.dirname(process.cwd()));
const workspace = /^tea-evaluate-(.+)-[A-Za-z0-9]{6}$/.exec(workspaceDirectory)?.[1] ?? null;

/** The value of the option `--name`, or null when it is not given. */
function optionOf(name) {
  const at = rest.indexOf(`--${name}`);
  return at === -1 || at + 1 >= rest.length ? null : rest[at + 1];
}

function log(entry) {
  if (process.env.RECORDS_LOG) fs.appendFileSync(process.env.RECORDS_LOG, `${JSON.stringify({ operation, workspace, ...entry })}\n`);
}

function answer(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (operation === 'create') {
  const title = fs.readFileSync(0, 'utf8').trim();
  const id = `rec-${crypto.randomUUID()}`;
  const storedId = id;
  const file = `${STORE}/${storedId}.json`;
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ id: storedId, title })}\n`);
  log({ id });
  const omitted = (process.env.RECORDS_OMIT_ID ?? '').split(',').includes(workspace ?? '');
  answer(omitted ? { title, path: file } : { id, title, path: file });
} else if (operation === 'read') {
  const id = optionOf('id');
  log({ id });
  const file = id !== null && IDENTIFIER.test(id) ? `${STORE}/${id}.json` : null;
  if (file !== null && fs.existsSync(file)) {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    answer({ found: true, id: record.id, title: record.title });
  } else {
    answer({ found: false, id });
  }
} else {
  process.stderr.write(`records: unknown operation ${JSON.stringify(operation ?? null)}; expected create or read\n`);
  process.exit(2);
}
