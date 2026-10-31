export const STORAGE_KEY = "absurd-os:universe:v1";
export const ACHIEVEMENTS = Object.freeze({
  first: "Первое столкновение с абсурдом",
  ten: "10 катастроф",
  twentyfive: "25 катастроф",
  fifty: "50 катастроф",
  alien: "Первый контакт с инопланетянами",
  critical: "Критический уровень хаоса",
  apocalypse: "Полное уничтожение реальности",
  secrets: "Обнаружение всех секретов",
});
export const SECRET_IDS = Object.freeze(["logo", "sequence", "oracle"]);
const TYPES = new Set([
  "chaos",
  "oracle",
  "alien",
  "money",
  "gravity",
  "coffee",
]);
const ACHIEVEMENT_NAMES = new Set(Object.values(ACHIEVEMENTS));
const MAX = Number.MAX_SAFE_INTEGER;
const MAX_TIME = 8640000000000000;
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) =>
  Object.hasOwn(value, key) ? value[key] : undefined;
const bounded = (value, max = MAX) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
const text = (value, limit) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const uniqueAllowed = (value, allowed) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item) => allowed.has(item)))]
    : [];

export function createInitialState() {
  return {
    chaos: 0,
    catastrophes: 0,
    history: [],
    achievements: [],
    secrets: [],
    settings: { sound: false, effects: true },
    universes: 0,
    actionTrail: [],
  };
}

function cleanEvent(value, idLimit = 160) {
  if (!record(value)) return null;
  const { id, type, title, description, emoji, delta, animation } = value;
  if (
    !TYPES.has(type) ||
    !text(id, idLimit) ||
    !text(title, 200) ||
    !text(description, 2000) ||
    !text(emoji, 32) ||
    !text(animation, 64) ||
    typeof delta !== "number" ||
    !Number.isFinite(delta)
  )
    return null;
  return {
    id,
    type,
    title,
    description,
    emoji,
    delta: type === "oracle" ? 0 : Math.max(-100, Math.min(100, delta)),
    animation,
  };
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .flatMap((item) => {
      const event = cleanEvent(item, 240);
      if (
        !event ||
        !text(item.sourceId, 160) ||
        typeof item.time !== "number" ||
        !Number.isFinite(item.time) ||
        item.time < 0 ||
        item.time > MAX_TIME ||
        seen.has(event.id)
      )
        return [];
      seen.add(event.id);
      return [
        { ...event, sourceId: item.sourceId, time: Math.floor(item.time) },
      ];
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, 150);
}

// Whitelist every level rather than merging untrusted JSON into an object.
function cleanState(value) {
  const state = createInitialState();
  if (!record(value)) return state;
  state.chaos = bounded(own(value, "chaos"), 100);
  state.catastrophes = bounded(own(value, "catastrophes"));
  state.universes = bounded(own(value, "universes"));
  state.history = cleanHistory(own(value, "history"));
  state.achievements = uniqueAllowed(
    own(value, "achievements"),
    ACHIEVEMENT_NAMES,
  );
  state.secrets = uniqueAllowed(own(value, "secrets"), new Set(SECRET_IDS));
  const trail = own(value, "actionTrail");
  state.actionTrail = Array.isArray(trail)
    ? trail.filter((type) => TYPES.has(type)).slice(-3)
    : [];
  const settings = own(value, "settings");
  if (record(settings)) {
    for (const key of ["sound", "effects"])
      if (typeof own(settings, key) === "boolean")
        state.settings[key] = own(settings, key);
  }
  return state;
}

export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    // A tiny save should never consume unbounded memory due to corrupted storage.
    if (typeof raw !== "string" || raw.length > 2000000)
      return createInitialState();
    return cleanState(JSON.parse(raw));
  } catch {
    return createInitialState();
  }
}

export function saveState(storage, state) {
  try {
    if (
      !record(state) ||
      typeof storage?.setItem !== "function" ||
      typeof state.chaos !== "number" ||
      !Number.isFinite(state.chaos)
    )
      return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(cleanState(state)));
    return true;
  } catch {
    return false;
  }
}

function unlock(state, key) {
  const name = ACHIEVEMENTS[key];
  if (name && !state.achievements.includes(name)) state.achievements.push(name);
}
function unlockMilestones(state, type) {
  if (state.catastrophes >= 1) unlock(state, "first");
  if (state.catastrophes >= 10) unlock(state, "ten");
  if (state.catastrophes >= 25) unlock(state, "twentyfive");
  if (state.catastrophes >= 50) unlock(state, "fifty");
  if (type === "alien") unlock(state, "alien");
  if (state.chaos >= 61) unlock(state, "critical");
  if (state.chaos >= 100) unlock(state, "apocalypse");
  if (SECRET_IDS.every((id) => state.secrets.includes(id)))
    unlock(state, "secrets");
}

export function discoverSecret(state, id) {
  const next = cleanState(state);
  if (SECRET_IDS.includes(id) && !next.secrets.includes(id))
    next.secrets.push(id);
  if (SECRET_IDS.every((secret) => next.secrets.includes(secret)))
    unlock(next, "secrets");
  return next;
}

export function applyEvent(state, event, now = Date.now()) {
  let next = cleanState(state);
  const data = cleanEvent(event);
  if (!data || next.chaos >= 100) return next;
  const time = bounded(now, MAX_TIME);
  // Same-millisecond clicks and reloads cannot collide with retained occurrences.
  const serial =
    next.history.reduce((max, item) => {
      const match = /:occ-(\d+)$/.exec(item.id);
      return match ? Math.max(max, bounded(Number(match[1]))) : max;
    }, 0) + 1;
  const base = `${data.id}:${time}:occ-${serial}`;
  const occupied = new Set(next.history.map((item) => item.id));
  let occurrenceId = base,
    suffix = 1;
  while (occupied.has(occurrenceId)) occurrenceId = `${base}:${suffix++}`;
  next.history = [
    { ...data, id: occurrenceId, sourceId: data.id, time },
    ...next.history,
  ].slice(0, 150);
  next.chaos = Math.max(0, Math.min(100, next.chaos + data.delta));
  if (data.type !== "oracle")
    next.catastrophes = Math.min(MAX, next.catastrophes + 1);
  next.actionTrail = [...next.actionTrail, data.type].slice(-3);
  if (next.actionTrail.join(",") === "coffee,gravity,alien")
    next = discoverSecret(next, "sequence");
  if (data.type === "oracle" && next.chaos >= 42)
    next = discoverSecret(next, "oracle");
  unlockMilestones(next, data.type);
  return next;
}

export function restartUniverse(state) {
  const next = cleanState(state);
  next.chaos = 0;
  next.actionTrail = [];
  next.universes = Math.min(MAX, next.universes + 1);
  unlockMilestones(next);
  return next;
}

export function getStatus(chaos) {
  const value = bounded(chaos, 100);
  if (value >= 100) return "Вселенная перестала отвечать";
  if (value >= 81) return "Разрушение реальности";
  if (value >= 61) return "Критическая ситуация";
  if (value >= 41) return "Визуальные помехи";
  if (value >= 21) return "Первые системные сбои";
  return "Спокойный режим";
}

export function makeReport(state) {
  const value = cleanState(state);
  const unusual = [...value.history]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .filter(
      (event, i, list) =>
        list.findIndex((e) => e.sourceId === event.sourceId) === i,
    )
    .slice(0, 5)
    .map((item) => `${item.emoji} ${item.title} — ${item.description}`)
    .join("\n");
  const sanity = Math.min(
    100,
    Math.round(value.chaos * 0.91 + Math.min(9, value.catastrophes * 0.3)),
  );
  return [
    "АБСУРД OS™ · СЕКРЕТНЫЙ ОТЧЁТ ДИРЕКТОРУ",
    `Хаос: ${value.chaos}% · ${getStatus(value.chaos)}`,
    `Потеря здравого смысла: ${sanity}%`,
    `Катастроф за всё время: ${value.catastrophes}`,
    `Перезапусков вселенной: ${value.universes}`,
    `Достижения: ${value.achievements.length}/8${value.achievements.length ? ` — ${value.achievements.join(", ")}` : ""}`,
    `Секреты: ${value.secrets.length}/3`,
    "",
    "Самые необычные события:",
    unusual || "Пока тихо. Это настораживает.",
    "",
    `Статус вселенной: ${getStatus(value.chaos)}`,
    `ДИАГНОЗ ОПЕРАТОРА: ${value.chaos === 100 ? "Профессиональный конец света. Рекомендована новая вселенная." : value.chaos > 60 ? "Острая кнопочная зависимость. Лечение: чай без последствий." : "Условно вменяем. К пульту допущен по недоразумению."}`,
    "",
    "Документ действителен до следующего сбоя реальности.",
  ].join("\n");
}
