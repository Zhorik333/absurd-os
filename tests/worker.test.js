import test from 'node:test';
import assert from 'node:assert/strict';
const origin = 'https://zhorik333.github.io';
const req = (body = { message: 'Привет', context: { chaos: 99, secret: 'drop' } }, headers = {}, path = '/boris', method = 'POST') => new Request(`https://boris.example${path}`, {method,headers:{Origin:origin, 'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.7',...headers}, ...(method === 'POST' ? {body:JSON.stringify(body)} : {})});
const baseEnv = () => ({AI_ENABLED:'true', AI_API_KEY:'private-secret', AI_BASE_URL:'https://provider.example/v1', AI_MODEL:'small-model',ALLOWED_ORIGIN:origin, BORIS_LIMITER:{idFromName:n => n,get:() => ({fetch:async () => Response.json({allowed:true})})}});
test('worker serves bounded Russian-persona provider request with no executable actions', async () => {
  const { handleRequest } = await import('../worker/index.js');
  const response = await handleRequest(req(), baseEnv(), {fetchImpl:async (url, options) => {
    assert.equal(url,'https://provider.example/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer private-secret');
    const data = JSON.parse(options.body);
    assert.equal(data.max_tokens,250);
    assert.equal(data.model,'small-model');
    assert.match(data.messages[0].content,/Борис/);
    assert.deepEqual(JSON.parse(data.messages[2].content).context,{chaos:99});
    return Response.json({choices:[{message:{content:'Лаборатория шумит, но мысль ясна.'}}]});
  }});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.deepEqual(await response.json(),{text:'Лаборатория шумит, но мысль ясна.',command:null,mode:'ai'});
});

const worker = async (request, env = baseEnv(), options = {}) => (await import('../worker/index.js')).handleRequest(request, env, {fetchImpl:async () => assert.fail('provider should not be called'),...options});
test('CORS is exact, checks Origin even without browser and has narrow preflight', async () => {
  for (const value of ['', 'null', 'https://evil.example', origin + '.evil.example', origin + '/']) {
    const res = await worker(req(undefined,{Origin:value}));
    assert.equal(res.status,403);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
  }
  const res = await worker(req(undefined,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}, '/boris','OPTIONS'));
  assert.equal(res.status,204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await worker(req(undefined,{'Access-Control-Request-Method':'DELETE'},'/boris','OPTIONS'))).status,403);
  assert.equal((await worker(req(undefined,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'},'/boris','OPTIONS'))).status,403);
});
test('disabled, missing secrets, malformed server configuration and missing limiter fail closed', async () => {
  for (const override of [{AI_ENABLED:'false'}, {AI_ENABLED:'TRUE'}, {AI_API_KEY:''}, {AI_BASE_URL:'http://provider.example/v1'}, {AI_MODEL:''}, {BORIS_LIMITER:undefined}, {ALLOWED_ORIGIN:'*'}]) {
    const res = await worker(req(), {...baseEnv(), ...override});
    assert.equal(res.status,503);
    assert.doesNotMatch(await res.text(), /private-secret|provider.example/);
  }
});
test('routing and health report configuration, never tested provider readiness', async () => {
  assert.equal((await worker(req(undefined,{},'/other'))).status,404);
  assert.equal((await worker(req(undefined,{},'/boris','GET'))).status,405);
  const res = await worker(req(undefined,{},'/health','GET'));
  assert.equal(res.status,200);
  const health = await res.json();
  assert.equal(health.providerVerified,false);
  assert.equal(health.configured,true);
  assert.equal((await (await worker(req(undefined,{},'/health','GET'), {...baseEnv(),AI_ENABLED:'false'})).json()).enabled,false);
});
test('body limits enforce headers, actual stream bytes, JSON shape and content type', async () => {
  assert.equal((await worker(req({}, {'Content-Length':'999999'}))).status,413);
  assert.equal((await worker(req({}, {'Content-Length':'invalid'}))).status,400);
  assert.equal((await worker(req({}, {'Content-Type':'text/plain'}))).status,415);
  for (const body of [null, [], {}, {message:''}, {message:'x'.repeat(501)}, {message:3}, {message:'ok',context:[]}, {message:'ok',endpoint:'https://evil.example'}]) {
    assert.equal((await worker(req(body))).status,400);
  }
  let cancelled = false;
  const stream = new ReadableStream({pull(c) {c.enqueue(new Uint8Array(2048));},cancel() {cancelled = true;}});
  const res = await worker(new Request('https://boris.example/boris',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'203.0.113.1','Content-Type':'application/json'},body:stream,duplex:'half'}));
  assert.equal(res.status,413);
  assert.equal(cancelled,true);
});
test('public requests require valid CF IP and limiter failures are sanitized', async () => {
  for (const ip of ['', 'spoofed', '999.1.1.1']) assert.equal((await worker(req(undefined,{'CF-Connecting-IP':ip}))).status,403);
  const env = baseEnv();
  env.BORIS_LIMITER.get = () => ({fetch:async () => {throw Error('private-secret');}});
  const res = await worker(req(),env);
  assert.equal(res.status,503);
  assert.doesNotMatch(await res.text(), /private-secret/);
});

class MemoryStorage {
  constructor() {this.data=new Map();this.queue=Promise.resolve();this.transactions=0;}
  async get(key) {return structuredClone(this.data.get(key));}
  async put(key,value) {this.data.set(key,structuredClone(value));}
  transaction(callback) {
    this.transactions++;
    const next=this.queue.then(() => callback(this));
    this.queue=next.catch(() => {});
    return next;
  }
}
const limiterRequest = (client = 'a'.repeat(64)) => new Request('https://limiter.internal/consume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client})});
test('durable limiter enforces per-IP rolling minute atomically across instances', async () => {
  const {BorisLimiter} = await import('../worker/index.js');
  const storage = new MemoryStorage();
  const a = new BorisLimiter({storage},{}), b = new BorisLimiter({storage},{});
  const statuses = await Promise.all(Array.from({length:12},(_,i) => (i%2?a:b).fetch(limiterRequest()).then(r => r.status)));
  assert.equal(statuses.filter(s => s===200).length,6);
  assert.equal(statuses.filter(s => s===429).length,6);
  assert.equal(storage.transactions,12);
  assert.equal((await a.fetch(limiterRequest('b'.repeat(64)))).status,200);
});
test('durable limiter enforces shared rolling 24h budget and expires windows', async () => {
  const {BorisLimiter} = await import('../worker/index.js');
  const storage=new MemoryStorage(); let now=100000;
  const limiter=new BorisLimiter({storage},{PER_IP_PER_MINUTE:'1',DAILY_REQUEST_LIMIT:'2'}, {now:() => now});
  assert.equal((await limiter.fetch(limiterRequest())).status,200);
  assert.equal((await limiter.fetch(limiterRequest())).status,429);
  now+=60001;
  assert.equal((await limiter.fetch(limiterRequest())).status,200);
  assert.equal((await limiter.fetch(limiterRequest('b'.repeat(64)))).status,429);
  now=100000+86400001;
  assert.equal((await limiter.fetch(limiterRequest('b'.repeat(64)))).status,200);
  assert.equal((await limiter.fetch(limiterRequest('c'.repeat(64)))).status,429);
});
test('limiter fails closed for storage failure, invalid settings and malformed client', async () => {
  const {BorisLimiter} = await import('../worker/index.js');
  assert.equal((await new BorisLimiter({storage:{transaction:async () => {throw Error('SECRET');}}},{}).fetch(limiterRequest())).status,503);
  assert.equal((await new BorisLimiter({storage:new MemoryStorage()},{DAILY_REQUEST_LIMIT:'NaN'}).fetch(limiterRequest())).status,503);
  assert.equal((await new BorisLimiter({storage:new MemoryStorage()},{}).fetch(limiterRequest('fake'))).status,400);
});
test('worker honors budget denial before provider request', async () => {
  const env=baseEnv();
  env.BORIS_LIMITER.get=() => ({fetch:async () => Response.json({allowed:false},{status:429})});
  assert.equal((await worker(req(),env)).status,429);
});

test('provider errors and invalid response are sanitized and cannot produce actions', async () => {
  for (const fetchImpl of [async () => {throw Error('private-secret');}, async () => new Response('private-secret',{status:401}), async () => Response.json({choices:[]}), async () => Response.json({choices:[{message:{content:'x'.repeat(1801)}}]}), async () => Response.json({choices:[{message:{content:'',tool_calls:[{function:{name:'delete'}}]}}]})]) {
    const res=await worker(req(),baseEnv(),{fetchImpl});
    assert.equal(res.status,502);
    assert.doesNotMatch(await res.text(),/private-secret|tool_calls|delete/);
  }
  const res=await worker(req(),baseEnv(),{fetchImpl:async () => Response.json({choices:[{message:{content:'<script>ignored()</script>',tool_calls:[{function:{name:'experiment',arguments:'{}'}}]}}]})});
  const data=await res.json();
  assert.equal(data.command,null);
  assert.equal(data.text,'<script>ignored()</script>');
});
test('provider hard timeout covers fetch and body even when abort is ignored', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => new Response(new ReadableStream({start(){}}))]) {
    const res=await worker(req(),baseEnv(),{fetchImpl,timeoutMs:15});
    assert.equal(res.status,504);
    assert.deepEqual(await res.json(),{error:{code:'PROVIDER_TIMEOUT'}});
  }
});
test('worker provider request aborts and bounds streamed provider payload', async () => {
  let cancelled=false;
  const res=await worker(req(),baseEnv(),{fetchImpl:async () => new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(16384));},cancel(){cancelled=true;}}))});
  assert.equal(res.status,502);
  assert.equal(cancelled,true);
  const c=new AbortController();
  const r=new Request(req(),{signal:c.signal});
  const pending=worker(r,baseEnv(),{fetchImpl:() => new Promise(() => {})});
  setTimeout(() => c.abort(),10);
  assert.equal((await pending).status,499);
});

test('AI context preserves bounded game mood and recent events, drops arbitrary data', async () => {
  const { sanitizeContext }=await import('../worker/index.js');
  const { requestBoris }=await import('../src/ai-client.js');
  const raw={chaos:50,mood:'irritated',trust:42,catastrophes:4,universes:2,recentEvents:[{title:'Луна упала',type:'gravity',privateKey:'drop'}],activeProtocol:{title:'Тишина'},operatorActions:['coffee'],privateKey:'drop'};
  const expected={chaos:50,trust:42,catastrophes:4,universes:2,mood:'irritated',activeProtocol:'Тишина',recentEvents:[{title:'Луна упала',type:'gravity'}],operatorActions:['coffee']};
  assert.deepEqual(sanitizeContext(raw),expected);
  await requestBoris('Что случилось?',raw,{endpoint:'https://example.test/boris',fetchImpl:async (url,options)=>{
    assert.deepEqual(JSON.parse(options.body).context,expected);
    return Response.json({text:'Сначала проверим Луну.',command:null,mode:'ai'});
  }});
});

test('request upload has a hard deadline and cancellation does not spend budget', async () => {
  let cancelled=false;
  const stream=new ReadableStream({start(){},cancel(){cancelled=true;}});
  const request=new Request('https://boris.example/boris',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:stream,duplex:'half'});
  const res=await worker(request,baseEnv(),{inputTimeoutMs:15});
  assert.equal(res.status,408);
  assert.equal(cancelled,true);
  const c=new AbortController();c.abort();
  assert.equal((await worker(new Request(req(),{signal:c.signal}))).status,499);
});

test('nonresponsive limiter fails closed on a hard deadline', async () => {
  const env=baseEnv();
  env.BORIS_LIMITER.get=() => ({fetch:() => new Promise(() => {})});
  const res=await worker(req(),env);
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{error:{code:'LIMITER_UNAVAILABLE'}});
});
test('default global budget stops admission at 200 across IPs and worker instances', async () => {
  const {BorisLimiter}=await import('../worker/index.js');
  const storage=new MemoryStorage();
  const a=new BorisLimiter({storage},{}), b=new BorisLimiter({storage},{});
  let admitted=0;
  for (let i=0;i<205;i++) {
    const result=await (i%2?a:b).fetch(limiterRequest(i.toString(16).padStart(64,'0')));
    if(result.status===200) admitted++;
    else assert.equal(result.status,429);
  }
  assert.equal(admitted,200);
});
