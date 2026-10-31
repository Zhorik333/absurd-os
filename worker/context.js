// Shared, data-only allowlist. This module has no provider/config/secret access.
// Public game identifiers, not credentials. Tests compare these with the game catalogs.
const ACHIEVEMENTS = new Set([
  'Первое столкновение с абсурдом','10 катастроф','25 катастроф','50 катастроф',
  'Первый контакт с инопланетянами','Критический уровень хаоса',
  'Полное уничтожение реальности','Обнаружение всех секретов',
  'conversation','colleagues','warned','failure','control','double','creator','tea','patient','observer',
]);
const SECRET_IDS = new Set(['logo','sequence','oracle']);
export function sanitizeContext(context) {
  const result = {};
  for (const key of ['chaos', 'energy', 'stability', 'trust', 'catastrophes', 'universes']) {
    const max = ['catastrophes', 'universes'].includes(key) ? 1000000 : 100;
    if (typeof context?.[key] === 'number' && Number.isFinite(context[key])) result[key] = Math.max(0, Math.min(max, context[key]));
  }
  for (const key of ['activeExperiment', 'screen']) if (typeof context?.[key] === 'string') result[key] = context[key].slice(0,64);
  if (['inspired','mad','irritated','curious','panic','smug','suspicious','calm'].includes(context?.mood)) result.mood = context.mood;
  const protocol = typeof context?.activeProtocol === 'string' ? context.activeProtocol : context?.activeProtocol?.title;
  if (typeof protocol === 'string') result.activeProtocol = protocol.slice(0,64);
  if (Array.isArray(context?.recentEvents)) result.recentEvents = context.recentEvents.filter(e=>e && typeof e.title === 'string').slice(0,3).map(e=>({title:e.title.slice(0,80),type:typeof e.type === 'string' ? e.type.slice(0,24) : ''}));
  if (Array.isArray(context?.operatorActions)) result.operatorActions = context.operatorActions.filter(a=>typeof a === 'string').slice(-3).map(a=>a.slice(0,32));
  for (const [key, allowed] of [['achievements',ACHIEVEMENTS],['secrets',SECRET_IDS]]) {
    const values = Array.isArray(context?.[key]) ? [...new Set(context[key].filter(value=>allowed.has(value)))] : [];
    if (values.length) result[key] = values;
  }
  // 500 UTF-16 message units can occupy 3000 JSON bytes (escaped controls or
  // lone surrogates). A 1024-byte context leaves room for the JSON envelope
  // under the unchanged 4096-byte server ceiling, for every valid message.
  const oversized = () => new TextEncoder().encode(JSON.stringify(result)).byteLength > 1024;
  for (const key of ['recentEvents','operatorActions']) {
    while (oversized() && result[key]?.length > 1) {
      if (key === 'recentEvents') result[key].pop(); else result[key].shift();
    }
  }
  const fields = [[result,'screen'],[result,'activeExperiment'],[result,'activeProtocol'],
    ...(result.recentEvents ?? []).flatMap(event=>[[event,'title'],[event,'type']]),
    ...(result.operatorActions ?? []).map((_,index)=>[result.operatorActions,index])];
  for (const [object,key] of fields) {
    while (oversized() && typeof object[key] === 'string' && object[key].length > 16) object[key] = object[key].slice(0,Math.max(16,Math.floor(object[key].length/2)));
  }
  for (const key of ['achievements','recentEvents','operatorActions','secrets']) {
    while (oversized() && result[key]?.length) result[key].pop();
    if (['achievements','secrets'].includes(key) && result[key]?.length === 0) delete result[key];
  }
  // Even hostile escaped strings in optional scalars must fit the same budget.
  for (const key of ['screen','activeExperiment','activeProtocol']) if (oversized()) delete result[key];
  return result;
}
