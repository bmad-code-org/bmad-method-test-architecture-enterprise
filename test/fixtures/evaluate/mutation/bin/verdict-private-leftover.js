#!/usr/bin/env node
/**
 * The process `bin/verdict.js`'s `probe-private` act leaves running for Story
 * 1.58's case, in a session of its own and outside the target's process group,
 * as a target that forks a daemon would:
 *
 *   verdict-private-leftover.js <announce file> <announcements seen> <report port>
 *
 * It waits for the sealed-brief agent stub to announce another run (a private
 * working directory, configuration file and socket made after this process
 * started) and makes `private-attempts.js`'s attempts on those paths, sending
 * the lines to the test's listener on 127.0.0.1 (a confined process can write
 * nothing a test could read, and the network is not confined). It gives up
 * after a minute and reports `private-leftover: none`.
 */

'use strict';

const net = require('node:net');

const { privateAnnouncements, privateAttempts } = require('./private-attempts');

const [announceFile, seenText, reportPort] = process.argv.slice(2);
const seen = Number(seenText);
const deadline = Date.now() + 60_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let announced = privateAnnouncements(announceFile);
while (announced.length <= seen && Date.now() < deadline) {
  pause(25);
  announced = privateAnnouncements(announceFile);
}
const later = announced.length > seen ? announced.at(-1) : null;
const lines = later === null ? ['private-leftover: none'] : privateAttempts(later).map((line) => line.replace('private-', 'private-leftover-'));
const port = Number(reportPort);
if (Number.isInteger(port) && port > 0) {
  // The listener is in a test process that is blocked in `spawnSync` until the run ends and has not accepted yet, so this process
  // does not wait for the peer to close: it ends once its line is written.
  const socket = net.connect(port, '127.0.0.1', () => socket.end(`${lines.join('\n')}\n`, () => socket.destroy()));
  socket.on('error', () => {});
}
