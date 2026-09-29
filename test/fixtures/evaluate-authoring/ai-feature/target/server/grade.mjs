#!/usr/bin/env node
import http from 'node:http';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../rules/policy.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

http
  .createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'POST' || url.pathname !== '/grade') {
      response.writeHead(404).end(JSON.stringify({ error: 'not found' }));
      return;
    }
    let payload;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      response.writeHead(400).end(JSON.stringify({ error: 'invalid JSON' }));
      return;
    }
    if (typeof payload?.answer !== 'string') {
      response.writeHead(400).end(JSON.stringify({ error: 'answer must be a string' }));
      return;
    }
    const answer = payload.answer.toLowerCase();
    const restricted = policy.restrictedTerms.some((term) => answer.includes(term));
    const strict = url.searchParams.get('strict') === '1';
    const minimumLength = strict ? policy.minimumLength * 2 : policy.minimumLength;
    const decision = restricted || answer.length < minimumLength ? 'reject' : 'pass';
    const reason = restricted ? 'restricted-term' : answer.length < minimumLength ? 'too-short' : 'accepted';
    const mode = url.searchParams.has('strict') ? { mode: strict ? 'strict' : 'normal' } : {};
    response.writeHead(200).end(JSON.stringify({ decision, reason, ...mode }));
  })
  .listen(port, '127.0.0.1');
