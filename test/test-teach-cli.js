'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const CLI = path.resolve(__dirname, '../cli/teach.js');
const AGENT = path.resolve(__dirname, 'fixtures/teach-cli/agent.js');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-teach-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    run(message = 'I want to learn testing', mode = 'normal', args = []) {
      return spawnSync(
        process.execPath,
        [
          CLI,
          '--project-root',
          root,
          '--learner',
          'Murat',
          '--message',
          message,
          '--state-dir',
          'learner',
          '--agent',
          'custom',
          '--agent-cmd',
          process.execPath,
          '--agent-arg',
          AGENT,
          '--agent-arg',
          mode,
          ...args,
        ],
        { encoding: 'utf8', timeout: 20_000 },
      );
    },
  };
}
test('public command publishes one caller-owned learner turn and resumes without inventing answers', (t) => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.match(result.reply, /What is your role/);
  let conversation = JSON.parse(fs.readFileSync(result.conversation));
  assert.equal(conversation.turns.length, 1);
  assert.equal(conversation.turns[0].learnerMessage, 'I want to learn testing');
  const second = f.run('QA');
  assert.equal(second.status, 0, second.stderr);
  conversation = JSON.parse(fs.readFileSync(result.conversation));
  assert.equal(conversation.turns.length, 2);
  assert.equal(conversation.turns[1].learnerMessage, 'QA');
});
test('preview retains a prompt while leaving published learner state unchanged', (t) => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  const before = fs.readFileSync(path.join(f.root, 'learner/conversation.json'));
  const preview = spawnSync(
    process.execPath,
    [CLI, '--project-root', f.root, '--learner', 'Murat', '--message', 'QA', '--state-dir', 'learner', '--agent', 'none'],
    { encoding: 'utf8' },
  );
  assert.equal(preview.status, 0, preview.stderr);
  const result = JSON.parse(preview.stdout);
  const prompt = fs.readFileSync(result.prompt, 'utf8');
  assert.match(prompt, /next teaching question/);
  assert.doesNotMatch(prompt, /Never ask the user questions/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'learner/conversation.json')), before);
});
test('invalid identity, invented completion and malformed generated YAML preserve published state', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const original = fs.readFileSync(path.join(f.root, 'learner/conversation.json'));
  for (const mode of ['identity', 'completion', 'legacy', 'failure', 'mutate-live-failure', 'escape', 'invent-answer']) {
    const failed = f.run('QA', mode);
    assert.equal(failed.status, 3, failed.stderr);
    assert.deepEqual(fs.readFileSync(path.join(f.root, 'learner/conversation.json')), original);
  }
});
test('canonical quiz grades caller answers and preserves explicit below-pass Continue without mastery', (t) => {
  const f = fixture(t);
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  for (const message of ['C', 'B', 'A', 'A']) {
    const result = f.run(message, 'quiz');
    assert.equal(result.status, 0, result.stderr);
  }
  let progress = require('js-yaml').load(fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8'));
  assert.equal(progress.sessions[0].score, 66.67);
  assert.equal(progress.sessions[0].status, 'in-progress');
  const continued = f.run('C', 'quiz');
  assert.equal(continued.status, 0, continued.stderr);
  progress = require('js-yaml').load(fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8'));
  assert.equal(progress.sessions[0].status, 'completed');
  assert.equal(progress.sessions[0].quiz_passed, false);
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'learner/conversation.json')));
  assert.deepEqual(
    conversation.quiz['session-01-quickstart'].answers.map((answer) => answer.answer),
    ['B', 'A', 'A'],
  );
  assert.equal(conversation.turns.at(-1).learnerMessage, 'C');
  const forgotten = f.run('C', 'forget');
  assert.equal(forgotten.status, 3, forgotten.stderr);
});
test('all three correct answers establish passing mastery and notes are preserved on later turns', (t) => {
  const f = fixture(t);
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  for (const message of ['C', 'B', 'A', 'B']) {
    const result = f.run(message, 'quiz');
    assert.equal(result.status, 0, result.stderr);
  }
  const progress = require('js-yaml').load(fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8'));
  assert.equal(progress.sessions[0].score, 100);
  assert.equal(progress.sessions[0].quiz_passed, true);
  const note = fs.readFileSync(progress.sessions[0].notes_artifact);
  const next = f.run('Show my progress');
  assert.equal(next.status, 0, next.stderr);
  assert.deepEqual(fs.readFileSync(progress.sessions[0].notes_artifact), note);
  const altered = f.run('Review my notes', 'mutate-notes');
  assert.equal(altered.status, 3, altered.stderr);
  assert.deepEqual(fs.readFileSync(progress.sessions[0].notes_artifact), note);
});
test('JSON output collisions are refused before generation and after a late hardlink', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'package.json'), '{"name":"preserve"}');
  const early = f.run('QA', 'normal', ['--json', 'learner/conversation.json']);
  assert.equal(early.status, 2, early.stderr);
  const late = f.run('QA', 'late-json-alias', ['--json', 'result.json']);
  assert.equal(late.status, 2, late.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), '{"name":"preserve"}');
  assert.equal(fs.existsSync(path.join(f.root, 'learner/conversation.json')), false);
});
test('explicit legacy import binds the learner and transparently normalizes one trailing empty YAML document', (t) => {
  const f = fixture(t);
  const initial = f.run();
  assert.equal(initial.status, 0, initial.stderr);
  const legacy = path.join(f.root, 'legacy.yaml');
  fs.writeFileSync(legacy, fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8') + '---\n');
  const imported = f.run('Continue', 'normal', ['--state-dir', 'imported', '--progress', 'legacy.yaml']);
  assert.equal(imported.status, 0, imported.stderr);
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'imported/conversation.json')));
  assert.equal(conversation.importedProgress.legacyNormalized, true);
  const wrong = f.run('Continue', 'normal', ['--learner', 'Other', '--state-dir', 'wrong', '--progress', 'legacy.yaml']);
  assert.equal(wrong.status, 2, wrong.stderr);
});
test('failed atomic directory replacement restores prior conversation and progress together', (t) => {
  const { publishState } = require('../cli/lib/teach-turn');
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const root = path.join(f.root, 'learner');
  const before = fs.readFileSync(path.join(root, 'conversation.json'));
  const io = Object.create(fs);
  io.renameSync = (source, destination) => {
    if (path.basename(source) === 'next') throw new Error('controlled replacement failure');
    return fs.renameSync(source, destination);
  };
  assert.throws(() => publishState(root, new Map([['conversation.json', Buffer.from('new')]]), io), /previous state preserved/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'conversation.json')), before);
  assert.ok(fs.existsSync(path.join(root, 'Murat-tea-progress.yaml')));
});
test('transport retries default to zero and opted retries retain the same learner message in fresh attempts', (t) => {
  const f = fixture(t);
  const once = f.run('QA', 'failure');
  assert.equal(once.status, 3);
  const onceRecord = JSON.parse(fs.readFileSync(path.join(JSON.parse(once.stdout).evidence, 'run.json')));
  assert.equal(onceRecord.attempts.length, 1);
  const retry = f.run('QA', 'failure', ['--retries', '1']);
  assert.equal(retry.status, 3);
  const run = JSON.parse(retry.stdout).evidence;
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, 'run.json'))).attempts.length, 2);
  const first = fs.readFileSync(path.join(run, 'attempt-1/prompt.txt'), 'utf8');
  const second = fs.readFileSync(path.join(run, 'attempt-2/prompt.txt'), 'utf8');
  assert.equal(JSON.parse(first.match(/^Teach turn request: (.*)$/m)[1]).message, 'QA');
  assert.equal(JSON.parse(second.match(/^Teach turn request: (.*)$/m)[1]).message, 'QA');
  assert.equal(fs.existsSync(path.join(f.root, 'learner/conversation.json')), false);
});
test('UTF-8 file input remains exact in the host-owned conversation and is protected from result publication', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'request.json'), 'QA\n');
  const args = [
    CLI,
    '--project-root',
    f.root,
    '--learner',
    'Murat',
    '--message-file',
    'request.json',
    '--state-dir',
    'learner',
    '--agent',
    'custom',
    '--agent-cmd',
    process.execPath,
    '--agent-arg',
    AGENT,
  ];
  const collision = spawnSync(process.execPath, [...args, '--json', 'request.json'], { encoding: 'utf8' });
  assert.equal(collision.status, 2);
  const turn = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(turn.status, 0, turn.stderr);
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'learner/conversation.json')));
  assert.equal(conversation.turns[0].learnerMessage, 'QA\n');
  assert.equal(fs.readFileSync(path.join(f.root, 'request.json'), 'utf8'), 'QA\n');
});
test('saved quiz evidence binds answers to their preceding question and recomputes correctness', (t) => {
  const f = fixture(t);
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  for (const message of ['C', 'B']) assert.equal(f.run(message, 'quiz').status, 0);
  const file = path.join(f.root, 'learner/conversation.json');
  const original = fs.readFileSync(file);
  for (const corrupt of [
    (conversation) => {
      conversation.quiz['session-01-quickstart'].answers[0].correct = false;
    },
    (conversation) => {
      conversation.turns[1].waiting.questionId = 'invented-question';
    },
  ]) {
    const conversation = JSON.parse(original);
    corrupt(conversation);
    fs.writeFileSync(file, JSON.stringify(conversation));
    const corruptBytes = fs.readFileSync(file);
    const refused = f.run('A', 'quiz');
    assert.equal(refused.status, 2, refused.stderr);
    assert.deepEqual(fs.readFileSync(file), corruptBytes);
  }
});
test('exploratory Session 7 requires the caller completion choice and makes no quiz mastery claim', (t) => {
  const f = fixture(t);
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  const invented = f.run('7', 'advanced-invent');
  assert.equal(invented.status, 3, invented.stderr);
  const exploration = f.run('7', 'advanced');
  assert.equal(exploration.status, 0, exploration.stderr);
  const complete = f.run('C', 'advanced');
  assert.equal(complete.status, 0, complete.stderr);
  const progress = require('js-yaml').load(fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8'));
  assert.equal(progress.sessions[6].status, 'completed');
  assert.equal(progress.sessions[6].quiz_passed, null);
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'learner/conversation.json')));
  assert.equal(conversation.turns.at(-1).learnerMessage, 'C');
  assert.deepEqual(conversation.quiz, {});
});
function completedImport(f) {
  const yaml = require('js-yaml');
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  const progress = yaml.load(fs.readFileSync(path.join(f.root, 'learner/Murat-tea-progress.yaml'), 'utf8'));
  fs.mkdirSync(path.join(f.root, 'imports'));
  for (const session of progress.sessions) {
    Object.assign(session, {
      status: 'completed',
      score: 100,
      completed_date: '2026-10-09',
      notes_artifact: path.join(f.root, 'imports', `${session.id}.md`),
    });
    fs.writeFileSync(
      session.notes_artifact,
      `---\nsession_id: ${session.id}\nuser: Murat\nscore: 100\n---\n# Notes\nRetained completed session.\n`,
    );
  }
  Object.assign(progress, {
    sessions_completed: 7,
    completion_percentage: 100,
    next_recommended: null,
    summary_generated: true,
    summary_path: path.join(f.root, 'imports/summary.md'),
    completion_date: '2026-10-09',
  });
  fs.writeFileSync(progress.summary_path, '# Completion summary\nAll seven sessions completed.\n');
  fs.writeFileSync(path.join(f.root, 'imports/progress.yaml'), yaml.dump(progress));
}
test('consumed config, legacy config, customization and policy bytes and topology are guarded', (t) => {
  for (const [relative, text] of [
    ['_bmad/config.toml', '[core]\nuser_name="Murat"\n'],
    ['_bmad/tea/config.yaml', 'user_name: Murat\n'],
    ['_bmad/custom/bmad-teach-me-testing.toml', '[workflow]\n'],
    ['_bmad/custom/bmad-teach-me-testing.user.toml', '[workflow]\n'],
    ['policies/learn.md', 'Preserve learner answers.\n'],
  ]) {
    for (const operation of ['bytes', 'mode', 'replace', 'link', 'delete']) {
      const f = fixture(t),
        file = path.join(f.root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      fs.chmodSync(file, 0o644);
      if (relative.startsWith('policies')) {
        fs.mkdirSync(path.join(f.root, '_bmad/custom'), { recursive: true });
        fs.writeFileSync(
          path.join(f.root, '_bmad/custom/bmad-teach-me-testing.toml'),
          '[workflow]\npersistent_facts=["file:policies/*.md"]\n',
        );
      }
      assert.equal(f.run().status, 0);
      const saved = fs.readFileSync(path.join(f.root, 'learner/conversation.json'));
      const failed = f.run('QA', `input:${operation}:${relative}`);
      assert.equal(failed.status, 3, failed.stderr);
      assert.deepEqual(fs.readFileSync(path.join(f.root, 'learner/conversation.json')), saved);
    }
  }
});
test('new optional config and matching customization policies fail without publishing', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, '_bmad/custom'), { recursive: true });
  fs.mkdirSync(path.join(f.root, 'policies'));
  fs.writeFileSync(path.join(f.root, 'policies/learn.md'), 'Policy');
  fs.writeFileSync(path.join(f.root, '_bmad/custom/bmad-teach-me-testing.toml'), '[workflow]\npersistent_facts=["file:policies/*.md"]\n');
  assert.equal(f.run().status, 0);
  const saved = fs.readFileSync(path.join(f.root, 'learner/conversation.json'));
  for (const mode of ['input:create:_bmad/config.user.toml', 'input:member:policies/learn.md']) {
    const failed = f.run('QA', mode);
    assert.equal(failed.status, 3, failed.stderr);
    assert.deepEqual(fs.readFileSync(path.join(f.root, 'learner/conversation.json')), saved);
  }
});
test('trusted completed imports preserve summary flags, path, date and exact content across continuation', (t) => {
  const f = fixture(t);
  completedImport(f);
  for (const mode of ['erase', 'flag', 'path', 'date', 'content']) {
    const failed = f.run('Show my completion', `summary:${mode}`, [
      '--state-dir',
      `invalid-${mode}`,
      '--progress',
      'imports/progress.yaml',
    ]);
    assert.equal(failed.status, 3, failed.stderr);
    assert.equal(fs.existsSync(path.join(f.root, `invalid-${mode}/conversation.json`)), false);
  }
  const good = f.run('Show my completion', 'normal', ['--state-dir', 'imported', '--progress', 'imports/progress.yaml']);
  assert.equal(good.status, 0, good.stderr);
  const pfile = path.join(f.root, 'imported/Murat-tea-progress.yaml');
  const progress = require('js-yaml').load(fs.readFileSync(pfile, 'utf8'));
  assert.equal(progress.summary_generated, true);
  assert.equal(progress.completion_date, '2026-10-09');
  assert.deepEqual(fs.readFileSync(progress.summary_path), fs.readFileSync(path.join(f.root, 'imports/summary.md')));
  const resumed = f.run('Show my history', 'normal', ['--state-dir', 'imported']);
  assert.equal(resumed.status, 0, resumed.stderr);
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'imported/conversation.json')));
  assert.equal(Object.keys(conversation.importedProgress.completedSessions).length, 7);
  assert.deepEqual(conversation.quiz, {});
  const preserved = fs.readFileSync(pfile);
  for (const mode of ['erase', 'content']) {
    const invalid = f.run('Show my history', `summary:${mode}`, ['--state-dir', 'imported']);
    assert.equal(invalid.status, 3, invalid.stderr);
    assert.deepEqual(fs.readFileSync(pfile), preserved);
    assert.deepEqual(fs.readFileSync(progress.summary_path), fs.readFileSync(path.join(f.root, 'imports/summary.md')));
  }
});
test('missing paired progress and completed sessions without quiz evidence fail before the vendor', (t) => {
  const f = fixture(t);
  assert.equal(f.run('QA Beginner Learn testing fundamentals', 'placement').status, 0);
  for (const message of ['C', 'B', 'A', 'B']) assert.equal(f.run(message, 'quiz').status, 0);
  const pfile = path.join(f.root, 'learner/Murat-tea-progress.yaml'),
    cfile = path.join(f.root, 'learner/conversation.json');
  const progress = fs.readFileSync(pfile),
    conversation = fs.readFileSync(cfile);
  const runCount = () => fs.readdirSync(path.join(f.root, '.tea-runs')).length;
  fs.unlinkSync(pfile);
  const prior = runCount();
  const missing = f.run('Show history');
  assert.equal(missing.status, 2, missing.stderr);
  assert.equal(runCount(), prior);
  assert.deepEqual(fs.readFileSync(cfile), conversation);
  assert.equal(fs.existsSync(pfile), false);
  fs.writeFileSync(pfile, progress);
  for (const quiz of [{}, null]) {
    const cleared = JSON.parse(conversation);
    cleared.importedProgress = { path: 'unproven.yaml', trustedPriorCompletions: 1 };
    if (quiz === null) delete cleared.quiz;
    else cleared.quiz = quiz;
    fs.writeFileSync(cfile, JSON.stringify(cleared));
    const bytes = fs.readFileSync(cfile);
    const invalid = f.run('Show history');
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.equal(runCount(), prior);
    assert.deepEqual(fs.readFileSync(cfile), bytes);
    assert.deepEqual(fs.readFileSync(pfile), progress);
  }
});
test('invalid configured artifact types have an actionable configuration error before vendor invocation', (t) => {
  for (const value of ['42', 'false', '[]', '""']) {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.root, '_bmad'));
    fs.writeFileSync(path.join(f.root, '_bmad/config.toml'), `[modules.tea]\ntest_artifacts=${value}\n`);
    const result = f.run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /test_artifacts must be a nonempty path string/);
    assert.doesNotMatch(result.stderr, /replaceAll|TypeError/);
    assert.equal(fs.existsSync(path.join(f.root, '.tea-runs')), false);
  }
});
test('unchanged captured native tutor artifacts replay through the repaired public controller', (t) => {
  const f = fixture(t);
  for (const [message, mode] of [
    ['I want to learn testing', 'native:1'],
    ['QA', 'native:2'],
  ]) {
    const result = f.run(message, mode, ['--learner', 'CLI evaluation learner']);
    assert.equal(result.status, 0, result.stderr);
  }
  const conversation = JSON.parse(fs.readFileSync(path.join(f.root, 'learner/conversation.json')));
  assert.deepEqual(
    conversation.turns.map((turn) => turn.learnerMessage),
    ['I want to learn testing', 'QA'],
  );
  assert.deepEqual(conversation.turns.at(-1).waiting, { kind: 'assessment', field: 'experience_level' });
  const progress = require('js-yaml').load(fs.readFileSync(path.join(f.root, 'learner/CLI evaluation learner-tea-progress.yaml'), 'utf8'));
  assert.equal(progress.role, 'QA');
  assert.equal(progress.sessions_completed, 0);
  assert.deepEqual(conversation.quiz, {});
});
