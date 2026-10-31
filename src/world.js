import * as v1 from './engine.js';
import {createBoris,sanitizeBoris,appendConversation,localReply,buildContext} from './boris.js';
import {EXPERIMENTS,validateCommand,resolveExperiment} from './experiments.js';
export {STORAGE_KEY,getStatus} from './engine.js';
export const BACKUP_KEY='absurd-os:backup:v1';
export const SOUND_CHANNELS=['event','alarm','end','notification','error','anomaly','experiment','success','boris'];
export const V2_ACHIEVEMENTS=Object.freeze([
 {id:'conversation',name:'Первый разговор',description:'Впервые поговорить с Борисом.'},
 {id:'colleagues',name:'Коллеги',description:'Провести 10 экспериментов.'},
 {id:'warned',name:'Я предупреждал',description:'Получить катастрофический результат эксперимента.'},
 {id:'failure',name:'Гениальный провал',description:'Столкнуться с особо нелепой ошибкой Бориса.'},
 {id:'control',name:'Всё под контролем',description:'Снизить хаос с критического уровня до безопасного.'},
 {id:'double',name:'Два Бориса',description:'Обнаружить альтернативного Бориса.'},
 {id:'creator',name:'Создатель хаоса',description:'Превысить свой сохранённый максимум хаоса.'},
 {id:'tea',name:'Чайная дипломатия',description:'Предложить Борису чай.',hidden:true},
 {id:'patient',name:'Терпеливый свидетель',description:'Поговорить с Борисом 12 раз.',hidden:true},
 {id:'observer',name:'Кто здесь лишний?',description:'Застать три самостоятельных системных происшествия.',hidden:true}
]);
const V2_IDS=new Set(V2_ACHIEVEMENTS.map(a=>a.id));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const number=(x,fallback=0,max=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isFinite(x)?Math.min(max,Math.max(0,x)):fallback;
const count=x=>Math.floor(number(x));
const short=(x,n)=>typeof x==='string'?x.slice(0,n):'';
function extras(raw={}){
 const s=object(raw.settings)?raw.settings:{};
 const ex=object(raw.experiments)?raw.experiments:{};
 const system=object(raw.system)?raw.system:{};
 const channels=Object.fromEntries(SOUND_CHANNELS.map(k=>[k,typeof s.channels?.[k]==='boolean'?s.channels[k]:true]));
 return {schemaVersion:2,boris:sanitizeBoris(raw.boris),maxChaos:Math.max(number(raw.chaos,0,100),number(raw.maxChaos,0,100)),v2Achievements:Array.isArray(raw.v2Achievements)?[...new Set(raw.v2Achievements.filter(id=>V2_IDS.has(id)))]:[],experiments:{count:count(ex.count),failures:count(ex.failures),rare:count(ex.rare)},system:{lastEventAt:number(system.lastEventAt,0,8640000000000000),observations:count(system.observations)},audio:{volume:number(s.volume,.45,1),channels,ai:s.ai===true,endpoint:short(s.endpoint,240)}};
}
export function createInitialState(){return {...v1.createInitialState(),schemaVersion:2,boris:createBoris(),maxChaos:0,v2Achievements:[],experiments:{count:0,failures:0,rare:0},system:{lastEventAt:0,observations:0},settings:{sound:false,effects:true,volume:.45,channels:Object.fromEntries(SOUND_CHANNELS.map(k=>[k,true])),ai:false,endpoint:''}}}
export function normalizeWorld(raw){
 const source=object(raw)?raw:{};
 const core=v1.loadState({getItem:()=>JSON.stringify(source)});
 const extra=extras(source);
 const byId=new Map(Array.isArray(source.history)?source.history.filter(object).map(e=>[e.id,e]):[]);
 core.history=core.history.map(e=>{const old=byId.get(e.id);if(!old||!['experiment','system','boris'].includes(old.origin))return e;return {...e,origin:old.origin,risk:['low','medium','high'].includes(old.risk)?old.risk:'low',outcome:['success','failure','rare','notice'].includes(old.outcome)?old.outcome:'notice'}});
 const {audio,...rest}=extra;
 return {...core,...rest,settings:{...core.settings,...audio}};
}
export function loadState(storage){
 try{const raw=storage?.getItem(v1.STORAGE_KEY);if(typeof raw!=='string'||raw.length>2000000)return createInitialState();const parsed=JSON.parse(raw);const result=normalizeWorld(parsed);if(object(parsed)&&parsed.schemaVersion!==2){try{if(!storage.getItem(BACKUP_KEY))storage.setItem(BACKUP_KEY,raw)}catch{/* Backup failure must not erase playable data. */}}return result}catch{return createInitialState()}
}
export function saveState(storage,state){try{if(!object(state)||typeof state.chaos!=='number'||!Number.isFinite(state.chaos)||typeof storage?.setItem!=='function')return false;storage.setItem(v1.STORAGE_KEY,JSON.stringify(normalizeWorld(state)));return true}catch{return false}}

function unlock(state,id){if(!state.v2Achievements.includes(id))state.v2Achievements.push(id)}
// V1 sanitizes away extensions, so reattach only our already-normalized fields.
function retainWorld(previous,core){
 const old=new Map(previous.history.map(event=>[event.id,event]));
 return normalizeWorld({...previous,...core,settings:{...previous.settings,...core.settings},history:core.history.map(event=>({...old.get(event.id),...event}))});
}
export function applyEvent(state,event,now=Date.now()){
 const previous=normalizeWorld(state);
 const core=v1.applyEvent(previous,event,now);
 const applied=core.history[0]?.id!==previous.history[0]?.id;
 const next=retainWorld(previous,core);
 if(applied){
  const occurrence=next.history.find(item=>item.id===core.history[0].id);
  const metadata=object(event)?event:{};
  if(occurrence&&['experiment','system','boris'].includes(metadata.origin)){
   Object.assign(occurrence,{origin:metadata.origin,risk:['low','medium','high'].includes(metadata.risk)?metadata.risk:'low',outcome:['success','failure','rare','notice'].includes(metadata.outcome)?metadata.outcome:'notice'});
  }
  if(next.chaos>previous.maxChaos)unlock(next,'creator');
  if(previous.chaos>=81&&next.chaos<81)unlock(next,'control');
 }
 next.maxChaos=Math.max(previous.maxChaos,next.chaos);
 return next;
}
export function restartUniverse(state){const previous=normalizeWorld(state);return retainWorld(previous,v1.restartUniverse(previous))}
export function discoverSecret(state,id){const previous=normalizeWorld(state);return retainWorld(previous,v1.discoverSecret(previous,id))}
export function makeReport(state){
 const next=normalizeWorld(state);
 const names=next.v2Achievements.map(id=>V2_ACHIEVEMENTS.find(item=>item.id===id).name);
 return [v1.makeReport(next),'','ЛАБОРАТОРИЯ БОРИСА · ПРИЛОЖЕНИЕ V2',
  `Экспериментов проведено: ${next.experiments.count}`,
  `Доверие Бориса: ${next.boris.trust}/100`,
  `Достижения V2: ${names.length}/${V2_ACHIEVEMENTS.length}${names.length?` — ${names.join(', ')}`:''}`].join('\n');
}
export function addConversation(state,text,response,now=Date.now(),mode='local'){
 const next=normalizeWorld(state);
 next.boris=appendConversation(next.boris,text,response,now,mode);
 unlock(next,'conversation');
 if(next.boris.turns>=12)unlock(next,'patient');
 if(typeof text==='string'&&/чай|чаю|tea/i.test(text))unlock(next,'tea');
 return next;
}
export function runExperiment(state,command,confirmed=false,now=Date.now(),rng=Math.random){
 const next=normalizeWorld(state);
 const validated=validateCommand(command);
 if(!validated||confirmed!==true||next.chaos>=100)return next;
 const result=resolveExperiment(validated.id,rng);
 const experiment=EXPERIMENTS.find(item=>item.id===validated.id);
 const applied=applyEvent(next,{...result.event,origin:'experiment',risk:experiment.risk,outcome:result.rare?'rare':result.success?'success':'failure'},now);
 applied.experiments={count:Math.min(Number.MAX_SAFE_INTEGER,next.experiments.count+1),failures:Math.min(Number.MAX_SAFE_INTEGER,next.experiments.failures+Number(!result.success)),rare:Math.min(Number.MAX_SAFE_INTEGER,next.experiments.rare+Number(result.rare))};
 applied.boris={...applied.boris,mood:applied.chaos>=81?'panic':result.catastrophic?'mad':result.success?'inspired':'irritated'};
 if(applied.experiments.count>=10)unlock(applied,'colleagues');
 if(result.catastrophic)unlock(applied,'warned');
 if(result.rare&&!result.success)unlock(applied,'failure');
 if(result.rare||validated.id==='double-boris')unlock(applied,'double');
 return applied;
}
// Keep the last five system incidents out of the draw, including across reloads.
const SYSTEM_EVENTS=Object.freeze([
 {id:'system-unknown-login',title:'Неизвестный пользователь вошёл',description:'В журнале появился вход пользователя «Никто». Поле пароля утверждает, что давно с ним знакомо.',emoji:'🪪'},
 {id:'system-second-operator',title:'Второй оператор у пульта',description:'Соседнее кресло запросило права администратора. Датчик присутствия насчитал полтора сотрудника.',emoji:'🪑'},
 {id:'system-time-stopped',title:'Время остановилось на обед',description:'Секундная стрелка повесила табличку «Вернусь вчера». Зарплатный таймер продолжает работать.',emoji:'⏸️'},
 {id:'system-deleted-report',title:'Борис удалил отчёт',description:'Борис отправил отчёт в корзину, чтобы улучшить статистику. Корзина вернула документ с пометкой «слишком тревожно».',emoji:'🗑️'},
 {id:'system-outside-universe',title:'Сигнал из-за пределов вселенной',description:'За границей наблюдаемого мира кто-то постучал по стеклу. Инструкция предлагает не кормить внешнюю бесконечность.',emoji:'🌌'},
 {id:'system-reality-update',title:'Обновление реальности готово',description:'Доступна заплатка для законов природы. Известная проблема: после установки понедельник может повториться.',emoji:'📦'}
].map(Object.freeze));
const SYSTEM_IDS=new Set(SYSTEM_EVENTS.map(event=>event.id));
// The caller owns visibility and scheduling; no background timers live in state.
export function systemPulse(state,now=Date.now(),rng=Math.random){
 const next=normalizeWorld(state);
 const time=Math.floor(number(now,0,8640000000000000));
 if(next.chaos>=100||time-next.system.lastEventAt<120000)return next;
 const roll=rng();
 if(!Number.isFinite(roll)||roll<0||roll>=.08)return next;
 const recent=new Set(next.history.filter(event=>event.origin==='system'&&SYSTEM_IDS.has(event.sourceId)).slice(0,5).map(event=>event.sourceId));
 const pool=SYSTEM_EVENTS.filter(event=>!recent.has(event.id));
 const choice=rng();
 const index=Math.floor((Number.isFinite(choice)?Math.max(0,Math.min(.999999999,choice)):0)*pool.length);
 const result=applyEvent(next,{...pool[index],type:'chaos',delta:0,animation:'glitch',origin:'system',risk:'low',outcome:'notice'},time);
 result.catastrophes=next.catastrophes;
 result.achievements=next.achievements;
 result.actionTrail=next.actionTrail;
 result.secrets=next.secrets;
 result.system={lastEventAt:time,observations:Math.min(Number.MAX_SAFE_INTEGER,next.system.observations+1)};
 // A rare observation may speak for itself, never invent an operator turn or trust gain.
 const reply=localReply('Произошло событие',buildContext(result),next.boris.usedLines,rng);
 const base=`boris-system-${time}-${result.system.observations}`;
 const occupied=new Set(next.boris.chat.map(row=>row.id));
 let id=base,serial=0;
 while(occupied.has(id))id=`${base}-${++serial}`;
 result.boris=sanitizeBoris({...next.boris,mood:reply.mood,lastSpokeAt:time,
  chat:[...next.boris.chat,{id,role:'boris',text:reply.text,time,mode:'local'}].slice(-80),
  usedLines:[...next.boris.usedLines.filter(line=>line!==reply.lineId),reply.lineId].slice(-30)});
 if(result.system.observations>=3)unlock(result,'observer');
 return result;
}
