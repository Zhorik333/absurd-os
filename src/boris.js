import { BORIS_LINES } from './boris-content.js';

const ACTION_LABELS = Object.freeze({chaos:'Генератор хаоса',oracle:'Оракул',alien:'Контакт с инопланетянами',money:'Денежный протокол',gravity:'Гравитационный протокол',coffee:'Кофейный протокол'});

export function localReply(message, context = {}, usedLines = [], rng = Math.random) {
  const input = text(typeof message === 'string' ? message.slice(0,500) : '',500).toLocaleLowerCase('ru');
  const ctx = record(context) ? context : {};
  const topics = [['coffee',/коф|coffee|эспрессо/],['gravity',/гравитац|gravity|притяжен/],['aliens',/инопланет|пришел|нло|alien/],['money',/деньг|денеж|бабл|money|валют/],['restart',/перезапуск|перезагруз|restart|сброс/],['trust',/довер|trust/],['name',/зовут|имя|борис|boris/]];
  const critical = number(ctx.chaos,100)>=81;
  const status = /состояни|вселенн|хаос|реальност/.test(input);
  const topic = topics.find(([id,re])=>id!=='name' && re.test(input))?.[0];
  const eventQuestion = /событ|случил|произош|действ|нажал|протокол/.test(input);
  const group = critical ? 'critical' : topic ?? (status ? moodId(ctx.mood) : eventQuestion ? 'event' : topics.at(-1)[1].test(input) ? 'name' : moodId(ctx.mood));
  const recent = strings(usedLines,30);
  const used = new Set(recent);
  const matching = BORIS_LINES.filter(line=>line.group===group);
  let pool = matching.filter(line=>!used.has(line.id));
  // Exhaustion must not change the topic/mood. Reuse the least recent match.
  if (!pool.length) pool = [matching.reduce((oldest,line)=>recent.indexOf(line.id)<recent.indexOf(oldest.id) ? line : oldest)];
  const roll = rng();
  const index = Math.floor((Number.isFinite(roll) ? Math.max(0,Math.min(0.999999999,roll)) : 0)*pool.length);
  const line = pool[index];
  let answer = line.text;
  const latest = Array.isArray(ctx.recentEvents) ? ctx.recentEvents[0] : null;
  const reflectWorld = critical || (!topic && (status || eventQuestion));
  if (reflectWorld) {
    answer += ` Текущий хаос: ${number(ctx.chaos,100)} из 100.`;
    const action = strings(ctx.operatorActions,30).at(-1);
    const protocol = record(ctx.activeProtocol) ? text(ctx.activeProtocol.title,200) : text(ctx.activeProtocol,100);
    if (action || protocol) answer += ` Последнее действие оператора: «${action || protocol}»${action && protocol ? ` (${protocol})` : ''}.`;
  }
  if (latest && (reflectWorld || group==='event' || latest.type===group || (group==='aliens' && latest.type==='alien'))) answer += ` Последнее событие: «${text(latest.title,200)}».`;
  if (group==='trust') answer += ` Текущее доверие: ${number(ctx.trust,100,35)} из 100.`;
  return {text:answer,mood:critical ? 'panic' : line.mood,lineId:line.id};
}

export function appendConversation(boris, operatorText, response, now = Date.now(), mode = 'local') {
  const state = sanitizeBoris(boris);
  const reply = record(response) ? response : {};
  const time = number(now,8640000000000000);
  const turns = Math.min(Number.MAX_SAFE_INTEGER,state.turns+1);
  const safeMode = mode === 'ai' ? 'ai' : 'local';
  const occupied = new Set(state.chat.map(row=>row.id));
  const row = (role, value) => {
    const base = `${role}-${time}-${turns}`;
    let id = base, serial = 0;
    while (occupied.has(id)) id = `${base}-${++serial}`;
    occupied.add(id);
    return {id,role,text:text(value,role==='operator' ? 500 : 1800),time,mode:safeMode};
  };
  const lineId = text(reply.lineId,200);
  return {...state,mood:moodId(reply.mood),trust:Math.min(100,state.trust+1),chat:[...state.chat,row('operator',operatorText),row('boris',reply.text)].slice(-80),usedLines:[...state.usedLines.filter(id=>id!==lineId),...(lineId ? [lineId] : [])].slice(-30),lastSpokeAt:time,turns};
}

export const MOODS = Object.freeze([
  {id:'inspired',label:'Вдохновлённый',color:'#fbbf24'},
  {id:'mad',label:'Безумный',color:'#c084fc'},
  {id:'irritated',label:'Раздражённый',color:'#fb923c'},
  {id:'curious',label:'Любопытный',color:'#22d3ee'},
  {id:'panic',label:'Паника',color:'#f87171'},
  {id:'smug',label:'Самодовольный',color:'#a3e635'},
  {id:'suspicious',label:'Подозрительный',color:'#a78bfa'},
  {id:'calm',label:'Спокойный',color:'#34d399'},
].map(Object.freeze));
export function createBoris() {
  return {mood:'curious',trust:35,chat:[],usedLines:[],lastSpokeAt:0,turns:0};
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, max = Number.MAX_SAFE_INTEGER, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
// These strings are display text, never markup or executable commands.
const text = (value, max = 1800) => typeof value === 'string' ? value.normalize('NFKC').replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0,max) : '';
const strings = (value, max = 100) => Array.isArray(value) ? value.filter(v=>typeof v==='string').map(v=>text(v,200)).filter(Boolean).slice(-max) : [];
const moodId = value => MOODS.some(m=>m.id===value) ? value : 'curious';
export function sanitizeBoris(raw) {
  if (!record(raw)) return createBoris();
  return {
    mood:moodId(raw.mood), trust:number(raw.trust,100,35),
    chat:Array.isArray(raw.chat) ? raw.chat.filter(row=>record(row) && typeof row.id==='string' && row.id.length>0 && ['operator','boris'].includes(row.role) && typeof row.text==='string' && Number.isFinite(row.time) && row.time>=0 && ['local','ai'].includes(row.mode)).slice(-80).map(row=>({id:text(row.id,160),role:row.role,text:text(row.text),time:number(row.time,8640000000000000),mode:row.mode})) : [],
    usedLines:strings(raw.usedLines,30), lastSpokeAt:number(raw.lastSpokeAt,8640000000000000), turns:number(raw.turns),
  };
}
export function buildContext(world = {}) {
  if (!record(world)) world = {};
  const b = sanitizeBoris(world.boris);
  const history = Array.isArray(world.history) ? world.history : [];
  const recentEvents = history.filter(record).map((e,i)=>({id:text(e.id,160),type:text(e.type,32),title:text(e.title,200),description:text(e.description,500),time:number(e.time),order:i})).sort((a,b)=>b.time-a.time || a.order-b.order).slice(0,5).map(({order,...event})=>event);
  const operatorActions = strings(world.operatorActions ?? world.actionTrail,30);
  const operatorHistory = history.filter(e=>record(e) && !['system','boris'].includes(e.origin) && Object.hasOwn(ACTION_LABELS,e.type)).sort((a,b)=>number(b.time)-number(a.time));
  const lastAction = operatorActions.filter(id=>Object.hasOwn(ACTION_LABELS,id)).at(-1) ?? operatorHistory[0]?.type;
  const lastEvent = operatorHistory.find(e=>e.type===lastAction);
  const activeProtocol = record(world.activeProtocol) ? {id:text(world.activeProtocol.id,100),title:text(world.activeProtocol.title,200)} : text(world.activeProtocol,100) || (lastAction ? {id:lastAction,title:text(lastEvent?.title,200) || ACTION_LABELS[lastAction]} : '');
  return {chaos:number(world.chaos,100),catastrophes:number(world.catastrophes),recentEvents,universes:number(world.universes),achievements:[...new Set([...strings(world.achievements),...strings(world.v2Achievements),...strings(world.achievementsV2)])],secrets:strings(world.secrets),activeProtocol,operatorActions,mood:b.mood,trust:b.trust};
}
