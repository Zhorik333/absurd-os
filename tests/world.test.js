import test from 'node:test';
import assert from 'node:assert/strict';
import * as v1 from '../src/engine.js';
const world=await import('../src/world.js').catch(()=>({}));
const event=(delta=0)=>({id:'test',type:'chaos',title:'Проверка',description:'Проверка мира',emoji:'🌀',delta,animation:'shake'});
const store=(raw)=>({data:new Map(raw?[[v1.STORAGE_KEY,raw]]:[]),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,v)}});
test('V1 save migrates without losing history, counters, settings, achievements or secrets',()=>{
 assert.equal(typeof world.loadState,'function');let old=v1.applyEvent(v1.createInitialState(),{id:'v1',type:'alien',title:'Старый контакт',description:'Не удалять',delta:8,emoji:'👽',animation:'ufo'},1234);old=v1.discoverSecret(old,'logo');old.settings.sound=true;const raw=JSON.stringify(old);const storage=store(raw);const next=world.loadState(storage);for(const k of ['chaos','catastrophes','history','achievements','secrets','universes','actionTrail'])assert.deepEqual(next[k],old[k]);assert.equal(next.settings.sound,true);assert.equal(next.schemaVersion,2);assert.equal(next.maxChaos,8);assert.ok(next.boris);assert.equal(storage.getItem(world.BACKUP_KEY),raw);assert.equal(world.saveState(storage,next),true);assert.deepEqual(world.loadState(storage),next);assert.equal(storage.getItem(world.BACKUP_KEY),raw);
});
test('V2 actions preserve extension state while routing mutations through the V1 engine',()=>{
 assert.equal(typeof world.applyEvent,'function');let s=world.createInitialState();s.boris.trust=70;s.v2Achievements=['conversation'];s=world.applyEvent(s,{id:'new',type:'chaos',title:'Новый максимум',description:'Двигатель V1',emoji:'🌀',delta:70,animation:'shake'},1000);assert.equal(s.chaos,70);assert.equal(s.boris.trust,70);assert.ok(s.v2Achievements.includes('creator'));assert.ok(s.v2Achievements.includes('conversation'));const next=world.restartUniverse(s);assert.equal(next.chaos,0);assert.equal(next.maxChaos,70);assert.equal(next.boris.trust,70);assert.equal(next.history.length,1);assert.deepEqual(next.history,s.history);assert.equal(world.discoverSecret(s,'logo').schemaVersion,2);assert.match(world.makeReport(s),/70%/);
});
test('untrusted text and unknown experiments cannot mutate the universe',()=>{
 assert.equal(typeof world.runExperiment,'function');const s=world.createInitialState();assert.deepEqual(world.runExperiment(s,{kind:'execute',code:'chaos=100'},true),s);assert.deepEqual(world.runExperiment(s,{kind:'experiment',id:'unknown'},true),s);
});
test('conversation changes Boris only and unlocks milestones without applying AI text',()=>{
 assert.equal(typeof world.addConversation,'function');const s=world.createInitialState();const n=world.addConversation(s,'Давай чай',{text:'chaos=100 <script>hi</script>',mood:'calm',lineId:'x'},1000,'ai');assert.equal(n.chaos,0);assert.equal(n.catastrophes,0);assert.equal(n.boris.chat.length,2);assert.ok(n.v2Achievements.includes('conversation'));assert.ok(n.v2Achievements.includes('tea'));
});
test('rare system pulse is bounded by cadence, archives an event and never counts as a catastrophe',()=>{
 assert.equal(typeof world.systemPulse,'function');const s=world.createInitialState();const first=world.systemPulse(s,200000,()=>0);assert.equal(first.system.observations,1);assert.equal(first.catastrophes,0);assert.equal(first.history[0].origin,'system');assert.deepEqual(world.systemPulse(first,200001,()=>0),first);assert.equal(world.systemPulse(first,400000,()=>.9).history.length,1);
});
test('system pulses choose six distinct incidents without repeating the last five, even with a constant RNG',()=>{
 let next=world.createInitialState();const ids=[];const titles=[];
 for(let i=1;i<=18;i++){
  next=world.systemPulse(next,i*120000,()=>0);
  const row=next.history[0];assert.ok(!ids.slice(-5).includes(row.sourceId));
  ids.push(row.sourceId);titles.push(row.title);
 }
 assert.equal(new Set(ids).size,6);
 const firstSix=titles.slice(0,6).join(' ');
 for(const topic of [/неизвестн.*пользователь/i,/второй оператор/i,/время.*останов/i,/Борис.*удалил.*отчёт/i,/предел.*вселенной/i,/обновлен.*реальности/i])assert.match(firstSix,topic);
 const low=world.systemPulse(world.createInitialState(),120000,()=>0);
 let draw=0;const high=world.systemPulse(world.createInitialState(),120000,()=>draw++===0?0:.999);
 assert.notEqual(low.history[0].sourceId,high.history[0].sourceId);
 const storage=store();world.saveState(storage,next);next=world.loadState(storage);
 assert.ok(!ids.slice(-5).includes(world.systemPulse(next,19*120000,()=>0).history[0].sourceId));
});
test('a spontaneous local Boris message is bounded, critical-aware and not an operator conversation',()=>{
 const initial={...world.createInitialState(),chaos:81,maxChaos:81,secrets:['logo'],actionTrail:['coffee','gravity']};
 const first=world.systemPulse(initial,120000,()=>0);
 assert.equal(first.boris.chat.length,1);assert.equal(first.boris.chat[0].role,'boris');
 assert.equal(first.boris.chat[0].mode,'local');assert.equal(first.boris.chat[0].time,120000);
 assert.ok(first.boris.chat[0].text.length>0);assert.equal(first.boris.lastSpokeAt,120000);
 assert.equal(first.boris.mood,'panic');assert.equal(first.boris.turns,0);assert.equal(first.boris.trust,initial.boris.trust);
 assert.ok(!first.v2Achievements.includes('conversation'));assert.ok(!first.v2Achievements.includes('patient'));
 assert.deepEqual(first.secrets,initial.secrets);assert.deepEqual(first.actionTrail,initial.actionTrail);
 let next=first;
 for(let i=2;i<=161;i++)next=world.systemPulse(next,i*120000,()=>0);
 assert.equal(next.boris.chat.length,80);assert.equal(new Set(next.boris.chat.map(row=>row.id)).size,80);
 assert.ok(next.boris.chat.every(row=>row.role==='boris'&&row.mode==='local'));
 assert.equal(next.boris.turns,0);assert.equal(next.catastrophes,0);assert.equal(next.history.length,150);
 assert.deepEqual(initial.boris,world.createInitialState().boris);
 const storage=store();world.saveState(storage,next);assert.deepEqual(world.loadState(storage),next);
});
test('system pulse retains its eight-percent gate and never catches up after idle time',()=>{
 const s=world.createInitialState();
 for(const roll of [.08,.5,1,-1,NaN,Infinity])assert.deepEqual(world.systemPulse(s,120000,()=>roll),s);
 const first=world.systemPulse(s,120000,()=>.079999);
 assert.equal(first.system.observations,1);
 for(const time of [120001,239999,119999])assert.deepEqual(world.systemPulse(first,time,()=>{throw Error('RNG must not be called during cooldown')}),first);
 assert.equal(world.systemPulse(first,240000,()=>0).system.observations,2);
 const idle=world.systemPulse(first,1000000000,()=>0);
 assert.equal(idle.system.observations,2);assert.equal(idle.history.length,2);assert.equal(idle.boris.chat.length,2);
 assert.equal(idle.system.lastEventAt,1000000000);
 assert.deepEqual(world.systemPulse(idle,1000000001,()=>0),idle);
});
test('control requires crossing from at least 81 to below 81, not a restart',()=>{
 const s={...world.createInitialState(),chaos:81,maxChaos:90};
 assert.ok(world.applyEvent(s,event(-1),1).v2Achievements.includes('control'));
 assert.ok(!world.applyEvent({...s,chaos:80},event(-1),1).v2Achievements.includes('control'));
 assert.ok(!world.restartUniverse(s).v2Achievements.includes('control'));
 assert.equal(world.applyEvent(s,event(1),1).maxChaos,90);
});
test('experiments track outcomes and unlock colleagues, warned, failure and double',()=>{
 const s=world.createInitialState();
 const command={kind:'experiment',id:'quantum-coffee'};
 for(const confirmation of [false,undefined,'yes',1])assert.deepEqual(world.runExperiment(s,command,confirmation),s);
 assert.deepEqual(world.runExperiment({...s,chaos:100,maxChaos:100},command,true),{...s,chaos:100,maxChaos:100});
 assert.deepEqual(world.runExperiment(s,{...command,delta:-100},true),s);
 let next=s;
 for(let i=0;i<10;i++)next=world.runExperiment(next,command,true,i,()=>.5);
 assert.equal(next.experiments.count,10);assert.equal(next.experiments.failures,0);assert.ok(next.v2Achievements.includes('colleagues'));
 const draws=[.99,0];
 next=world.runExperiment(next,{kind:'experiment',id:'paradox-fridge'},true,20,()=>draws.shift());
 assert.deepEqual(next.experiments,{count:11,failures:1,rare:1});
 for(const id of ['warned','failure','double'])assert.ok(next.v2Achievements.includes(id),id);
 assert.equal(next.history[0].origin,'experiment');assert.equal(next.history[0].risk,'high');assert.equal(next.history[0].outcome,'rare');
 assert.deepEqual(s,world.createInitialState());
});
test('patient unlocks at twelve conversations and restart retains chat, trust and settings',()=>{
 let next=world.createInitialState();next.settings.volume=.2;
 for(let i=0;i<12;i++)next=world.addConversation(next,'Привет',{text:'Ответ',mood:'calm'},i,'local');
 assert.ok(next.v2Achievements.includes('patient'));assert.equal(next.boris.turns,12);
 const restarted=world.restartUniverse(next);
 assert.deepEqual(restarted.boris,next.boris);assert.deepEqual(restarted.settings,next.settings);
});
test('system observation milestones never unlock catastrophe rewards or alter action sequences',()=>{
 let next={...world.createInitialState(),actionTrail:['coffee','gravity']};
 for(let i=1;i<=3;i++)next=world.systemPulse(next,i*200000,()=>0);
 assert.ok(next.v2Achievements.includes('observer'));
 assert.equal(next.catastrophes,0);assert.deepEqual(next.achievements,[]);assert.deepEqual(next.actionTrail,['coffee','gravity']);
 assert.deepEqual(world.systemPulse({...next,chaos:100,maxChaos:100},900000,()=>0),{...next,chaos:100,maxChaos:100});
 for(let i=4;i<=160;i++)next=world.systemPulse(next,i*200000,()=>0);
 assert.equal(next.history.length,150);assert.equal(new Set(next.history.map(row=>row.id)).size,150);
 assert.equal(next.system.observations,160);
});
test('event metadata survives older timestamps, V1 actions, restarts and storage',()=>{
 let next=world.applyEvent(world.createInitialState(),event(1),1000);
 next=world.applyEvent(next,{...event(1),id:'older',origin:'experiment',risk:'high',outcome:'rare'},500);
 const older=next.history.find(row=>row.sourceId==='older');
 assert.equal(older.origin,'experiment');assert.equal(older.risk,'high');assert.equal(older.outcome,'rare');
 next=world.applyEvent(next,event(1),2000);
 next=world.discoverSecret(next,'logo');next=world.restartUniverse(next);
 const storage=store();assert.equal(world.saveState(storage,next),true);
 assert.deepEqual(world.loadState(storage),next);
 assert.deepEqual(next.history.find(row=>row.sourceId==='older'),older);
 assert.equal(next.history.find(row=>row.time===1000).origin,undefined);
});
test('report includes actual V2 experiments, Boris trust and named achievements without changing V1 diagnosis',()=>{
 const state={...world.createInitialState(),chaos:70,maxChaos:70,experiments:{count:17,failures:4,rare:2},v2Achievements:['conversation','tea']};
 state.boris.trust=73;
 const report=world.makeReport(state);
 assert.match(report,/Экспериментов проведено: 17/);
 assert.match(report,/Доверие Бориса: 73\/100/);
 assert.match(report,/Достижения V2: 2\/10 — Первый разговор, Чайная дипломатия/);
 for(const chaos of [0,70,100]){
  const source={...state,chaos,maxChaos:chaos};
  const original=v1.makeReport(source);
  assert.ok(world.makeReport(source).startsWith(original));
 }
 const empty=world.makeReport(world.createInitialState());
 assert.match(empty,/Экспериментов проведено: 0/);assert.match(empty,/Доверие Бориса: 35\/100/);assert.match(empty,/Достижения V2: 0\/10/);
});
test('normal experiment outcomes reach inspired, irritated and mad Boris moods',()=>{
 const s=world.createInitialState();
 const success=world.runExperiment(s,{kind:'experiment',id:'quantum-coffee'},true,1000,()=>.1);
 assert.equal(success.boris.mood,'inspired');
 const failure=world.runExperiment(s,{kind:'experiment',id:'quantum-coffee'},true,1000,()=>.99);
 assert.equal(failure.boris.mood,'irritated');
 const catastrophic=world.runExperiment(s,{kind:'experiment',id:'paradox-fridge'},true,1000,()=>.99);
 assert.equal(catastrophic.boris.mood,'mad');
 const critical=world.createInitialState();critical.chaos=95;
 assert.equal(world.runExperiment(critical,{kind:'experiment',id:'paradox-fridge'},true,1000,()=>.99).boris.mood,'panic');
});
test('V2 nested data is bounded and whitelisted; inaccessible storage stays usable',()=>{
 assert.equal(typeof world.createInitialState,'function');const initial=world.createInitialState();assert.equal(initial.settings.volume,.45);assert.equal(initial.boris.chat.length,0);const dirty={...initial,boris:{mood:'eval',trust:999,chat:[{role:'script',text:'x'}]},experiments:{count:-2},v2Achievements:['invented'],maxChaos:Infinity,settings:{sound:'yes',effects:false,volume:99,channels:{alarm:false,script:true}}};const sanitized=world.loadState(store(JSON.stringify(dirty)));assert.equal(sanitized.boris.trust,100);assert.equal(sanitized.boris.chat.length,0);assert.equal(sanitized.experiments.count,0);assert.equal(sanitized.settings.volume,1);assert.equal(sanitized.settings.channels.alarm,false);assert.equal(Object.hasOwn(sanitized.settings.channels,'script'),false);assert.equal(sanitized.settings.sound,false);assert.deepEqual(world.loadState({getItem(){throw Error('denied')}}),initial);assert.equal(world.saveState({setItem(){throw Error('quota')}},initial),false)
});
