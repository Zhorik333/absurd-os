import test from 'node:test';
import assert from 'node:assert/strict';
import * as boris from '../src/boris.js';

test('sanitizer bounds untrusted saved conversations without mutating input', () => {
  const raw = {mood:'evil',trust:999,turns:-1,lastSpokeAt:NaN,chat:Array.from({length:90},(_,i)=>({id:`m${i}`,role:'operator',text:'x'.repeat(2000),time:i,mode:'local',code:'bad'})),usedLines:Array.from({length:40},(_,i)=>`l${i}`)};
  const safe=boris.sanitizeBoris(raw);
  assert.equal(safe.mood,'curious'); assert.equal(safe.trust,100); assert.equal(safe.turns,0); assert.equal(safe.lastSpokeAt,0);
  assert.equal(safe.chat.length,80); assert.equal(safe.chat[0].id,'m10'); assert.equal(safe.chat[0].text.length,1800);
  assert.deepEqual(Object.keys(safe.chat[0]),['id','role','text','time','mode']); assert.equal(safe.usedLines.length,30);
  assert.equal(raw.chat.length,90); assert.deepEqual(boris.sanitizeBoris(null),boris.createBoris());
  assert.equal(boris.sanitizeBoris({chat:[{id:'x',role:'system',text:'x',time:1,mode:'ai'}]}).chat.length,0);
});

test('context snapshots V1 and V2 details with newest five events', () => {
  const world={chaos:89,catastrophes:12,history:Array.from({length:9},(_,i)=>({title:`e${i}`,time:100-i})),universes:2,achievements:['first'],v2Achievements:['scientist'],secrets:['logo'],activeProtocol:'quiet',operatorActions:['coffee'],boris:{mood:'panic',trust:61}};
  const context=boris.buildContext(world);
  assert.equal(context.chaos,89); assert.equal(context.catastrophes,12); assert.equal(context.recentEvents.length,5);
  assert.equal(context.recentEvents[0].title,'e0'); assert.equal(context.universes,2);
  assert.deepEqual(context.achievements,['first','scientist']); assert.deepEqual(context.secrets,['logo']);
  assert.equal(context.activeProtocol,'quiet'); assert.deepEqual(context.operatorActions,['coffee']); assert.equal(context.mood,'panic'); assert.equal(context.trust,61);
  context.recentEvents[0].title='changed'; assert.equal(world.history[0].title,'e0');
});

test('context derives the active protocol from operator trail, not autonomous incidents', () => {
  const world={actionTrail:['coffee','gravity'],history:[
    {type:'chaos',title:'Системный сбой',origin:'system',time:30},
    {type:'gravity',title:'Гравитационный опыт',time:20},
    {type:'coffee',title:'Кофейный опыт',time:10},
  ]};
  assert.deepEqual(boris.buildContext(world).activeProtocol,{id:'gravity',title:'Гравитационный опыт'});
  assert.deepEqual(boris.buildContext({...world,actionTrail:[]}).activeProtocol,{id:'gravity',title:'Гравитационный опыт'});
  assert.equal(boris.buildContext({...world,activeProtocol:'manual'}).activeProtocol,'manual');
  assert.equal(boris.buildContext({history:[world.history[0]]}).activeProtocol,'');
});

test('local dialogue prioritizes critical chaos and avoids recent lines', async () => {
  const { BORIS_LINES } = await import('../src/boris-content.js');
  assert.ok(BORIS_LINES.length>=80); assert.equal(new Set(BORIS_LINES.map(l=>l.id)).size,BORIS_LINES.length);
  assert.equal(new Set(BORIS_LINES.map(l=>l.text)).size,BORIS_LINES.length);
  const used=[];
  for(let i=0;i<35;i++) {
    const reply=boris.localReply('Привет, кофе?',{chaos:81,recentEvents:[{title:'Луна упала'}]},used,()=>0);
    assert.equal(reply.mood,'panic'); assert.match(reply.text,/Луна упала/); assert.doesNotMatch(reply.text,/добро пожаловать/i);
    assert.ok(!used.includes(reply.lineId)); used.push(reply.lineId); if(used.length>30)used.shift();
  }
});

test('local dialogue answers each operator topic and handles unsafe or long input', () => {
  for(const [question,expected] of [['КОФЕ','коф'],['гравитация','гравитац'],['инопланетяне','инопланет'],['деньги','ден'],['перезапуск','перезапуск'],['доверие','довер'],['как тебя зовут','Борис']]) {
    const reply=boris.localReply(question,{chaos:0,trust:42},[],()=>0);
    assert.match(reply.text,new RegExp(expected,'i')); assert.ok(reply.lineId);
  }
  const a=boris.localReply('x'.repeat(500)+' кофе',{},[],()=>0);
  assert.deepEqual(a,boris.localReply('x'.repeat(500),{},[],()=>0));
  assert.doesNotMatch(boris.localReply('<script>alert(1)</script>',{},[],()=>0).text,/<script>/);
  assert.ok(boris.localReply(null,{},[],()=>0).text);
});

test('world assessment beats the Boris name and reflects chaos, latest event and operator action', () => {
  const context=boris.buildContext({chaos:47,actionTrail:['coffee','gravity'],history:[{type:'chaos',title:'Время остановилось',origin:'system',time:30},{type:'gravity',title:'Луна сдвинулась',time:20}]});
  let used=[];
  for (const question of ['Борис, оцени состояние вселенной','Борис, что с хаосом?','Борис, реальность цела?']) {
    const reply=boris.localReply(question,context,used,()=>0);
    assert.doesNotMatch(reply.lineId,/^name-/);
    assert.match(reply.text,/47.*100/);
    assert.match(reply.text,/Время остановилось/);
    assert.match(reply.text,/Последнее действие.*gravity|Последнее действие.*Луна сдвинулась/);
    assert.notEqual(reply.lineId,used.at(-1));
    used.push(reply.lineId);
  }
  assert.match(boris.localReply('Борис, как состояние кофе?',context,[],()=>0).lineId,/^coffee-/);
  const panic=boris.localReply('Борис, оцени вселенную',{...context,chaos:91},[],()=>0);
  assert.match(panic.lineId,/^critical-/); assert.equal(panic.mood,'panic'); assert.match(panic.text,/91.*100/);
  assert.match(boris.localReply('Что произошло?',context,[],()=>0).text,/Последнее действие/);
});

test('appendConversation creates bounded immutable turns and tracks trust and lines', () => {
  const before=boris.createBoris();
  const reply={text:'Проверим осторожно.',mood:'calm',lineId:'calm-1'};
  const after=boris.appendConversation(before,'  Привет  ',reply,123,'ai');
  assert.equal(before.chat.length,0); assert.equal(after.turns,1); assert.equal(after.lastSpokeAt,123);
  assert.equal(after.mood,'calm'); assert.equal(after.trust,36); assert.deepEqual(after.usedLines,['calm-1']);
  assert.deepEqual(after.chat.map(({role,text,time,mode})=>({role,text,time,mode})),[{role:'operator',text:'Привет',time:123,mode:'ai'},{role:'boris',text:reply.text,time:123,mode:'ai'}]);
  let state=after; for(let i=0;i<100;i++) state=boris.appendConversation(state,'x',reply,123);
  assert.equal(state.chat.length,80); assert.equal(state.trust,100); assert.equal(new Set(state.chat.map(r=>r.id)).size,80); assert.ok(state.usedLines.length<=30);
  const invalid=boris.appendConversation(null,'<b>x</b>',{text:'<script>x</script>',mood:'no',lineId:'id'},NaN,'evil');
  assert.equal(invalid.chat[0].mode,'local'); assert.equal(invalid.lastSpokeAt,0); assert.equal(invalid.mood,'curious'); assert.doesNotMatch(invalid.chat[1].text,/[<>]/);
});

test('each local mood survives pool exhaustion without immediate repeats', () => {
  for (const {id:mood} of boris.MOODS) {
    let used=[];
    for (let i=0;i<15;i++) {
      const reply=boris.localReply('привет', {mood,chaos:10},used,()=>0);
      assert.equal(reply.mood,mood);
      assert.notEqual(reply.lineId,used.at(-1));
      used=[...used.filter(id=>id!==reply.lineId),reply.lineId].slice(-30);
    }
  }
});
test('repeated topic stays relevant after its pool is used', () => {
  let used=[];
  for(let i=0;i<15;i++) {
    const reply=boris.localReply('кофе',{},used,()=>0);
    assert.match(reply.lineId,/^coffee-/);
    assert.notEqual(reply.lineId,used.at(-1));
    used=[...used.filter(id=>id!==reply.lineId),reply.lineId];
  }
});

test('Boris starts curious with eight Russian moods', () => {
  assert.deepEqual(boris.createBoris(), {mood:'curious',trust:35,chat:[],usedLines:[],lastSpokeAt:0,turns:0});
  assert.deepEqual(boris.MOODS.map(m=>m.id), ['inspired','mad','irritated','curious','panic','smug','suspicious','calm']);
  for(const mood of boris.MOODS) { assert.match(mood.label, /[а-яё]/i); assert.ok(mood.color); }
});
