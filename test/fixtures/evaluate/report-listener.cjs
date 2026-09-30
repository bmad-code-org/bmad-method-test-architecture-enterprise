'use strict';

/**
 * A listener on 127.0.0.1 that appends every line a connection sends to a
 * file, for Story 1.31's cases: a confined process can write nothing a test
 * could read, and the network is not confined, so a stub's leftover process
 * reports how its attempt ended here (`mutation/bin/verdict-leftover.js`).
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
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
