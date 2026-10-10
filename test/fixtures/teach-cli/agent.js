'use strict';
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const prompt = fs.readFileSync(0, 'utf8');
const request = JSON.parse(prompt.match(/^Teach turn request: (.*)$/m)[1]);
const mode = process.argv[2] || 'normal';
if (mode === 'failure') { process.stdout.write('partial response'); process.exit(1); }
let progress = fs.existsSync(request.artifacts.progress) ? yaml.load(fs.readFileSync(request.artifacts.progress, 'utf8')) : yaml.load(fs.readFileSync(path.join(request.skillRoot, 'templates/progress-template.yaml'), 'utf8'));
if (!request.previous) {
  Object.assign(progress, {user:request.learner,role:null,experience_level:null,learning_goals:null,pain_points:null,started_date:'2026-10-09',last_session_date:'2026-10-09',lastContinued:'2026-10-09',stepsCompleted:['step-01-init'],lastStep:'step-02-assess'});
}
if (mode === 'identity') progress.user = 'Other learner';
if (mode === 'completion') { const notes=progress.sessions[0].notes_artifact=path.join(request.artifacts.root,'notes.md');fs.mkdirSync(path.dirname(notes),{recursive:true});fs.writeFileSync(notes,`---\nsession_id: session-01-quickstart\nuser: ${request.learner}\nscore: 100\n---\n# Notes\nInvented completion.\n`);progress.sessions[0].status='completed';progress.sessions[0].score=100;progress.sessions[0].completed_date='2026-10-09';progress.sessions_completed=1;progress.completion_percentage=100/7;progress.next_recommended=progress.sessions[1].id;}
fs.mkdirSync(path.dirname(request.artifacts.progress),{recursive:true});
fs.writeFileSync(request.artifacts.progress,yaml.dump(progress));
if (mode === 'legacy') fs.appendFileSync(request.artifacts.progress,'---\n');
if (mode === 'escape') {fs.unlinkSync(request.artifacts.progress);fs.symlinkSync(path.join(process.cwd(),'learner/Murat-tea-progress.yaml'),request.artifacts.progress);}
fs.writeFileSync(request.artifacts.response,JSON.stringify({requestId:request.requestId,learner:request.learner,reply:'What is your role: QA, Dev, Lead or VP?',waiting:{kind:'assessment',field:'role'},factEvidence:{}}));
// Specialized controlled outputs exercise the public controller's evidence checks.
const conversation = JSON.parse(prompt.match(/^Host-owned conversation: (.*)$/m)[1]);
const bank = JSON.parse(prompt.match(/^Canonical quiz bank: (.*)$/m)[1]);
const responseFile = request.artifacts.response;
let response = JSON.parse(fs.readFileSync(responseFile));
if (mode === 'placement') {
  Object.assign(progress,{role:'QA',experience_level:'Beginner',learning_goals:'Learn testing fundamentals'});
  response.factEvidence={role:request.requestId,experience_level:request.requestId,learning_goals:request.requestId};
  response.waiting={kind:'menu'};response.reply='Choose a session.';
}
if (mode === 'quiz') {
  const sessionId='session-01-quickstart';
  progress.sessions[0].status='in-progress';progress.sessions[0].started_date='2026-10-09';
  const previous=conversation.turns.at(-1)?.waiting;
  const answers=[...(conversation.quiz[sessionId]?.answers ?? [])];
  if (previous?.kind==='quiz' && /^[ABCD]$/.test(request.message.trim())) {
    const question=bank[sessionId].questions.find(question=>question.id===previous.questionId);
    answers.push({questionId:question.id,answer:request.message.trim(),correct:request.message.trim()===question.correct});
  }
  if (answers.length===3) {
    const score=Math.round(answers.filter(answer=>answer.correct).length/3*10000)/100;
    progress.sessions[0].score=score;
    if (score>=70 || (previous?.kind==='review'&&request.message==='C')) {
      progress.sessions[0].status='completed';progress.sessions[0].completed_date='2026-10-09';
      const notes=progress.sessions[0].notes_artifact=path.join(request.artifacts.root,'teaching-sessions/session-01-notes.md');
      fs.mkdirSync(path.dirname(notes),{recursive:true});fs.writeFileSync(notes,`---\nsession_id: ${sessionId}\nuser: ${request.learner}\nscore: ${score}\n---\n# Session notes\nCaller answered the canonical quiz.\n`);
      progress.sessions_completed=1;progress.completion_percentage=100/7;progress.next_recommended=progress.sessions[1].id;
      response.reply='Session complete. Choose your next session.';response.waiting={kind:'menu'};
    } else {response.reply=`Quiz score ${score}. [R] Review or [C] Continue anyway?`;response.waiting={kind:'review',sessionId};}
  } else {
    const question=bank[sessionId].questions[answers.length];
    response.reply=question.question+'\n'+Object.entries(question.options).map(([letter,text])=>letter+') '+text).join('\n');
    response.waiting={kind:'quiz',sessionId,questionId:question.id};
  }
}
if (mode === 'forget') progress.role = null;
if (mode === 'late-json-alias') fs.linkSync(path.join(process.cwd(),'package.json'),path.join(process.cwd(),'result.json'));
if (mode === 'mutate-live-failure') {fs.writeFileSync(path.join(process.cwd(),'learner/conversation.json'),'corrupted');process.exit(1);}
if (mode === 'mutate-notes') fs.appendFileSync(progress.sessions[0].notes_artifact,'Unapproved changes');
if (mode === 'invent-answer') response.learnerAnswers=['B','A','B'];
if (!['legacy','escape'].includes(mode)) fs.writeFileSync(request.artifacts.progress,yaml.dump(progress));
fs.writeFileSync(responseFile,JSON.stringify(response));
if (mode === 'advanced' || mode === 'advanced-invent') {
  const session=progress.sessions[6];session.status='in-progress';session.started_date='2026-10-09';
  response.reply='Exploration complete. Choose C to complete Session 7.';response.waiting={kind:'completion',sessionId:session.id};
  if (request.message==='C' || mode==='advanced-invent') {
    session.status='completed';session.score=100;session.completed_date='2026-10-09';
    session.notes_artifact=path.join(request.artifacts.root,'advanced.md');
    fs.writeFileSync(session.notes_artifact,`---\nsession_id: ${session.id}\nuser: ${request.learner}\nscore: 100\n---\n# Advanced exploration\nLearner completed exploration.\n`);
    progress.sessions_completed=1;progress.completion_percentage=100/7;
    response.reply='Exploration complete. Choose another session.';response.waiting={kind:'menu'};
  }
  fs.writeFileSync(request.artifacts.progress,yaml.dump(progress));fs.writeFileSync(responseFile,JSON.stringify(response));
}
if(mode.startsWith('input:')) {
 const [_,operation,relative]=mode.split(':');const file=path.join(process.cwd(),relative);
 if(operation==='bytes')fs.appendFileSync(file,'\n# changed\n');
 if(operation==='mode')fs.chmodSync(file,0o600);
 if(operation==='replace'){const b=fs.readFileSync(file);fs.renameSync(file,file+'.old');fs.writeFileSync(file,b);}
 if(operation==='link'){fs.renameSync(file,file+'.old');fs.symlinkSync(file+'.old',file);}
 if(operation==='delete')fs.unlinkSync(file);
 if(operation==='create')fs.writeFileSync(file,'[core]\nuser_name="Changed"\n');
 if(operation==='member')fs.writeFileSync(path.join(path.dirname(file),'new.md'),'New policy');
}
if(mode.startsWith('summary:')) {
 const operation=mode.split(':')[1];
 if(operation==='erase'){progress.summary_generated=false;progress.summary_path=null;progress.completion_date=null;}
 if(operation==='flag')progress.summary_generated=false;
 if(operation==='path'){const previous=progress.summary_path;progress.summary_path=path.join(request.artifacts.root,'replacement-summary.md');fs.copyFileSync(previous,progress.summary_path);}
 if(operation==='date')progress.completion_date='2099-01-01';
 if(operation==='content')fs.appendFileSync(progress.summary_path,'Altered summary');
 fs.writeFileSync(request.artifacts.progress,yaml.dump(progress));
}
if(mode.startsWith('native:')) {
 const {gunzipSync}=require('node:zlib');const archive=JSON.parse(gunzipSync(fs.readFileSync(path.resolve(__dirname,'../../results/teach-codex-2026-10-09/public-cli/public-native.json.gz'))));
 const files=new Map(archive.files.map(file=>[file.path,Buffer.from(file.base64,'base64')]));const turn=mode.split(':')[1];
 const captured=JSON.parse(files.get(`turn-${turn}-stdout.json`));const run=path.basename(captured.evidence);
 const prefix=`learner-project/.tea-runs/${run}/attempt-1/`;
 const response=JSON.parse(files.get(prefix+'response.json'));response.requestId=request.requestId;
 for(const field of Object.keys(response.factEvidence))response.factEvidence[field]=request.requestId;
 const saved=[...files].find(([file])=>file.startsWith(prefix+'artifacts/teaching-progress/')&&file.endsWith('-tea-progress.yaml'));
 fs.writeFileSync(request.artifacts.progress,saved[1]);fs.writeFileSync(responseFile,JSON.stringify(response));
}
