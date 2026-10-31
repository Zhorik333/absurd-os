import test from 'node:test';
import assert from 'node:assert/strict';

test('client sends bounded context without secrets and returns inert AI text', async () => {
  const { requestBoris } = await import('../src/ai-client.js');
  const result = await requestBoris('Привет', { chaos: 90, secret: 'no' }, {
    endpoint: 'https://example.test/boris',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://example.test/boris');
      assert.deepEqual(JSON.parse(options.body), { message: 'Привет', context: { chaos: 90 } });
      return Response.json({ text: '<b>Борис</b>', command: null });
    },
  });
  assert.deepEqual(result, { text: '<b>Борис</b>', command: null, mode: 'ai' });
});

test('shared context forwards recognized gameplay unlocks only, never credentials or unknown values', async () => {
  const {sanitizeContext}=await import('../worker/context.js');
  const {ACHIEVEMENTS,SECRET_IDS}=await import('../src/engine.js');
  const {V2_ACHIEVEMENTS}=await import('../src/world.js');
  const achievements=[...Object.values(ACHIEVEMENTS),...V2_ACHIEVEMENTS.map(a=>a.id)];
  const raw={chaos:42,achievements:[...achievements,achievements[0],'api-key-123',{},null],secrets:[...SECRET_IDS,'do not transmit','API_KEY',{}],apiKey:'credential',token:'credential',settings:{AI_API_KEY:'credential'}};
  const safe=sanitizeContext(raw);
  assert.deepEqual(safe.achievements,achievements);
  assert.deepEqual(safe.secrets,[...SECRET_IDS]);
  assert.doesNotMatch(JSON.stringify(safe),/credential|api-key|do not transmit|API_KEY/);
  assert.deepEqual(sanitizeContext({secrets:['do not transmit'],achievements:['unknown']}),{});
  assert.deepEqual(sanitizeContext(safe),safe);
  await request('Привет',raw,{endpoint,fetchImpl:async (_,options)=>{
    assert.deepEqual(JSON.parse(options.body).context,safe);
    return Response.json({text:'Вижу игровые допуски.',command:null});
  }});
});

test('generated context fits the 4096-byte request ceiling even with worst-case 500-unit messages', async () => {
  const {buildContext}=await import('../src/boris.js');
  const {ACHIEVEMENTS,SECRET_IDS}=await import('../src/engine.js');
  const {V2_ACHIEVEMENTS}=await import('../src/world.js');
  const {sanitizeContext}=await import('../worker/context.js');
  const context=buildContext({chaos:81,catastrophes:1e8,universes:1e8,
    achievements:Object.values(ACHIEVEMENTS),v2Achievements:V2_ACHIEVEMENTS.map(a=>a.id),secrets:[...SECRET_IDS],
    activeProtocol:{title:String.fromCharCode(1).repeat(200)},actionTrail:['coffee','gravity','alien'],
    history:Array.from({length:5},(_,i)=>({title:'界'.repeat(200),type:'界'.repeat(32),time:i})),
  });
  for (const message of ['界'.repeat(500),String.fromCharCode(1).repeat(500),String.fromCharCode(0xd800).repeat(500)]) {
    let body;
    await request(message,context,{endpoint,fetchImpl:async (_,options)=>{
      body=options.body;
      return Response.json({text:'Контекст принят.',command:null});
    }});
    assert.ok(Buffer.byteLength(body,'utf8')<=4096,`request bytes: ${Buffer.byteLength(body,'utf8')}`);
    const sent=JSON.parse(body);
    assert.equal(sent.message,message); assert.equal(sent.context.chaos,81);
    assert.deepEqual(sanitizeContext(sent.context),sent.context);
    assert.ok(sent.context.achievements.length); assert.deepEqual(sent.context.secrets,[...SECRET_IDS]);
  }
});

const request = (...args) => import('../src/ai-client.js').then(m => m.requestBoris(...args));
const endpoint = 'https://example.test/boris';
test('endpoint and message validation prevents network calls', async () => {
  for (const url of [undefined, 'http://example.test/boris', 'javascript:alert(1)', 'https://user:pass@example.test/boris']) {
    await assert.rejects(request('hi', {}, { endpoint: url, fetchImpl: () => assert.fail('network') }), { code: 'CONFIG' });
  }
  await assert.rejects(request('x'.repeat(501), {}, { endpoint }), { code: 'INPUT' });
  await assert.rejects(request('', {}, { endpoint }), { code: 'INPUT' });
  assert.equal((await request('hi', {}, { endpoint: 'http://localhost:8787/boris', fetchImpl: async () => Response.json({text:'yes',command:null}) })).text, 'yes');
});
test('provider and malformed output errors are sanitized for fallback', async () => {
  await assert.rejects(request('hi', {}, { endpoint, fetchImpl: async () => { throw Error('SECRET'); } }), e => e.code === 'NETWORK' && !e.message.includes('SECRET'));
  await assert.rejects(request('hi', {}, { endpoint, fetchImpl: async () => new Response('SECRET', {status:429}) }), {code:'RATE_LIMIT'});
  for (const data of [{text:'x'.repeat(1801), command:null}, {text:'ok',command:{kind:'shell',id:'rm'}}, {text:'ok',command:{kind:'experiment',id:'unknown'}}, {text:'ok', command:null, token:'secret'}, {text:1}]) {
    await assert.rejects(request('hi', {}, {endpoint, fetchImpl: async () => Response.json(data)}), {code:'RESPONSE'});
  }
});
test('hard deadline includes response body and ignores noncooperative fetch', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => new Response(new ReadableStream({start(){}}))]) {
    await assert.rejects(request('hi', {}, {endpoint, timeoutMs:15, fetchImpl}), {code:'TIMEOUT'});
  }
});
test('external abort is immediate even when provider ignores signal', async () => {
  const controller = new AbortController();
  const promise = request('hi', {}, {endpoint,signal:controller.signal, fetchImpl:() => new Promise(() => {})});
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(promise, {code:'ABORTED'});
  await assert.rejects(request('hi', {}, {endpoint,signal:controller.signal}), {code:'ABORTED'});
});

test('optional AI honestly falls back locally when absent or failed, never on cancellation', async () => {
  const { replyWithFallback }=await import('../src/ai-client.js');
  for (const options of [{}, {endpoint,fetchImpl:async()=>new Response(null,{status:503})}]) {
    const result=await replyWithFallback('кофе',{chaos:90},options);
    assert.equal(result.mode,'local');
    assert.equal(result.mood,'panic');
    assert.equal(result.command,null);
    assert.ok(result.fallbackReason);
  }
  const live=await replyWithFallback('привет',{}, {endpoint,fetchImpl:async()=>Response.json({text:'Ответ',command:null,mode:'ai'})});
  assert.equal(live.mode,'ai');
  const c=new AbortController();c.abort();
  await assert.rejects(replyWithFallback('hi',{}, {endpoint,signal:c.signal}),{code:'ABORTED'});
});

test('client cancels oversized streamed response before parsing', async () => {
  let cancelled=false;
  await assert.rejects(request('hi',{}, {endpoint,fetchImpl:async () => new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(2048));},cancel(){cancelled=true;}}))}),{code:'RESPONSE'});
  assert.equal(cancelled,true);
});
