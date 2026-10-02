'use strict';

/**
 * A listener on 127.0.0.1 that appends every line a connection sends to a
 * file, for Story 1.31's cases: a confined process can write nothing a test
 * could read, and a Seatbelt process keeps the host's network, so a stub's
 * leftover process reports how its attempt ended here
 * (`mutation/bin/verdict-leftover.js`). A Bubblewrap process has a network
 * namespace of its own (Story 1.63), so its report never arrives; the cases
 * that read it accept no report there.
 *
 *   report-listener.cjs <lines file> <port file>
 *
 * It writes the port it listens on to the port file once listening, and runs
 * until it is killed.
 */

const fs = require('node:fs');
const net = require('node:net');

const [lines, portFile] = process.argv.slice(2);

const server = net.createServer((socket) => {
  let text = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    text += chunk;
  });
  socket.on('end', () => fs.appendFileSync(lines, text));
  socket.on('error', () => {});
});
server.listen(0, '127.0.0.1', () => {
  // Renamed into place, so a reader that sees the file sees the whole port.
  fs.writeFileSync(`${portFile}.part`, String(server.address().port));
  fs.renameSync(`${portFile}.part`, portFile);
});
