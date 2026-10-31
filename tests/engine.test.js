import test from "node:test";
import assert from "node:assert/strict";
const engine = await import("../src/engine.js").catch(() => ({}));
const content = await import("../src/content.js").catch(() => ({}));
test("original Russian content meets counts and event contract", () => {
  assert.ok(content.events);
  assert.ok(new Set(content.events.chaos.map((e) => e.animation)).size >= 5);
  const ids = new Set(),
    titles = new Set(),
    descriptions = new Set();
  for (const [type, min] of Object.entries({
    chaos: 60,
    oracle: 50,
    alien: 8,
    money: 8,
    gravity: 8,
    coffee: 8,
  })) {
    assert.ok(content.events[type].length >= min, type);
    for (const event of content.events[type]) {
      assert.equal(event.type, type);
      for (const key of ["id", "title", "description", "emoji", "animation"])
        assert.equal(typeof event[key], "string");
      assert.match(event.title, /[А-Яа-яЁё]/);
      assert.ok(!ids.has(event.id));
      ids.add(event.id);
      assert.ok(!titles.has(event.title));
      titles.add(event.title);
      assert.ok(!descriptions.has(event.description));
      descriptions.add(event.description);
      assert.ok(Number.isFinite(event.delta));
      if (type === "oracle") assert.equal(event.delta, 0);
    }
  }
});
const sample = (type = "chaos", delta = 7) => ({
  id: `sample-${type}`,
  type,
  title: "Тестовая вселенная",
  description: "Событие для проверки.",
  emoji: "🪐",
  delta,
  animation: "shake",
});
test("applyEvent is immutable and records complete unique occurrences", () => {
  const s = engine.createInitialState();
  const a = engine.applyEvent(s, sample(), 1000),
    b = engine.applyEvent(a, sample(), 1000);
  assert.equal(s.chaos, 0);
  assert.equal(s.history.length, 0);
  assert.equal(a.chaos, 7);
  assert.equal(b.catastrophes, 2);
  assert.equal(b.history.length, 2);
  assert.notEqual(b.history[0].id, b.history[1].id);
  assert.deepEqual(b.history[0], {
    ...sample(),
    id: b.history[0].id,
    sourceId: "sample-chaos",
    time: 1000,
  });
});
test("chaos clamps at both boundaries and all events stop at 100", () => {
  const initial = engine.createInitialState();
  assert.equal(engine.applyEvent(initial, sample("coffee", -10)).chaos, 0);
  const end = engine.applyEvent({ ...initial, chaos: 98 }, sample(), 1);
  assert.equal(end.chaos, 100);
  assert.deepEqual(engine.applyEvent(end, sample("coffee", -12)), end);
  assert.deepEqual(engine.applyEvent(end, sample("oracle", 0)), end);
});
test("oracle never changes chaos or catastrophe count, even with injected delta", () => {
  const s = { ...engine.createInitialState(), chaos: 45 };
  const next = engine.applyEvent(s, sample("oracle", 100), 2);
  assert.equal(next.chaos, 45);
  assert.equal(next.catastrophes, 0);
  assert.equal(next.history[0].delta, 0);
});
test("occurrence ids stay unique beyond the history cap at the same timestamp", () => {
  let s = engine.createInitialState();
  const ids = new Set();
  for (let i = 0; i < 400; i++) {
    s = engine.applyEvent(s, sample("oracle", 0), 123);
    assert.ok(!ids.has(s.history[0].id));
    ids.add(s.history[0].id);
  }
});
test("history is newest-first and capped at 150; zero delta still counts an action", () => {
  let s = engine.createInitialState();
  for (let i = 0; i < 170; i++)
    s = engine.applyEvent(s, sample("coffee", 0), i);
  assert.equal(s.history.length, 150);
  assert.equal(s.history[0].time, 169);
  assert.equal(s.history.at(-1).time, 20);
  assert.equal(s.catastrophes, 170);
  assert.ok(s.actionTrail.length <= 3);
});
test("three secrets are unique and engine discovers sequence and oracle condition", () => {
  let s = engine.discoverSecret(engine.createInitialState(), "logo");
  assert.deepEqual(s.secrets, ["logo"]);
  assert.deepEqual(engine.discoverSecret(s, "logo"), s);
  assert.deepEqual(engine.discoverSecret(s, "__proto__"), s);
  for (const type of ["coffee", "gravity", "alien"])
    s = engine.applyEvent(s, sample(type, 1), 1);
  assert.ok(s.secrets.includes("sequence"));
  s = engine.applyEvent({ ...s, chaos: 42 }, sample("oracle", 0), 2);
  assert.ok(s.secrets.includes("oracle"));
  assert.equal(s.secrets.length, 3);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.secrets));
});
test("secret sequence must be consecutive", () => {
  let s = engine.createInitialState();
  for (const type of ["coffee", "gravity", "oracle", "alien"])
    s = engine.applyEvent(s, sample(type, 0), 1);
  assert.ok(!s.secrets.includes("sequence"));
  assert.ok(!s.secrets.includes("oracle"));
});
test("eight named achievements unlock once at their milestones", () => {
  assert.equal(Object.keys(engine.ACHIEVEMENTS).length, 8);
  let s = engine.applyEvent(engine.createInitialState(), sample(), 1);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.first));
  s = engine.applyEvent({ ...s, catastrophes: 9 }, sample("coffee", 0), 2);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.ten));
  s = engine.applyEvent({ ...s, catastrophes: 49 }, sample("coffee", 0), 3);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.fifty));
  s = engine.applyEvent({ ...s, catastrophes: 24 }, sample("alien", 0), 4);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.twentyfive));
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.alien));
  s = engine.applyEvent({ ...s, chaos: 60 }, sample("chaos", 1), 4);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.critical));
  assert.deepEqual(Object.values(engine.ACHIEVEMENTS), [
    "Первое столкновение с абсурдом",
    "10 катастроф",
    "25 катастроф",
    "50 катастроф",
    "Первый контакт с инопланетянами",
    "Критический уровень хаоса",
    "Полное уничтожение реальности",
    "Обнаружение всех секретов",
  ]);
  s = engine.applyEvent({ ...s, chaos: 99 }, sample(), 5);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.apocalypse));
  s = engine.restartUniverse(s);
  assert.ok(s.achievements.includes(engine.ACHIEVEMENTS.apocalypse));
  assert.equal(s.chaos, 0);
  assert.equal(s.achievements.length, new Set(s.achievements).size);
});
test("restart preserves lifetime progress, resets transient state and increments universes", () => {
  let s = engine.discoverSecret(
    engine.applyEvent(engine.createInitialState(), sample(), 100),
    "logo",
  );
  s.settings.sound = true;
  const n = engine.restartUniverse(s);
  assert.equal(n.chaos, 0);
  assert.equal(n.universes, 1);
  assert.deepEqual(n.actionTrail, []);
  for (const key of ["history", "catastrophes", "secrets", "settings"])
    assert.deepEqual(n[key], s[key]);
  assert.ok(s.achievements.every((a) => n.achievements.includes(a)));
  n.settings.sound = false;
  assert.equal(s.settings.sound, true);
});
test("Russian status and report summarize actual progress", () => {
  const statuses = [0, 21, 41, 61, 81, 100].map(engine.getStatus);
  assert.equal(new Set(statuses).size, 6);
  statuses.forEach((x) => assert.match(x, /[А-Яа-яЁё]/));
  for (const [a, b] of [
    [0, 20],
    [21, 40],
    [41, 60],
    [61, 80],
    [81, 99],
  ])
    assert.equal(engine.getStatus(a), engine.getStatus(b));
  const s = engine.applyEvent(engine.createInitialState(), sample(), 100);
  const report = engine.makeReport(s);
  assert.equal(typeof report, "string");
  assert.match(report, /7/);
  assert.match(report, /Тестовая вселенная/);
  assert.match(report, /АБСУРД OS/);
  assert.match(report, /ДИАГНОЗ/);
  assert.match(report, /Потеря здравого смысла: 7%/);
  assert.match(report, /1/);
  assert.match(engine.makeReport(engine.createInitialState()), /0/);
});
test("invalid event payloads are rejected without throwing or mutating", () => {
  const s = engine.createInitialState();
  for (const event of [
    null,
    {},
    [],
    sample("__proto__"),
    { ...sample(), delta: Infinity },
    { ...sample(), title: 42 },
    { ...sample(), animation: null },
  ]) {
    assert.deepEqual(engine.applyEvent(s, event), s);
  }
});
function memoryStorage(raw = null) {
  return {
    raw,
    getItem(key) {
      assert.equal(key, engine.STORAGE_KEY);
      return this.raw;
    },
    setItem(key, value) {
      assert.equal(key, engine.STORAGE_KEY);
      this.raw = value;
    },
  };
}
test("storage round trip preserves a valid complete state", () => {
  assert.equal(typeof engine.STORAGE_KEY, "string");
  assert.ok(engine.STORAGE_KEY.length);
  let s = engine.applyEvent(engine.createInitialState(), sample(), 1234);
  s = engine.discoverSecret(s, "logo");
  s.settings.sound = true;
  const storage = memoryStorage();
  assert.equal(engine.saveState(storage, s), true);
  assert.deepEqual(engine.loadState(storage), s);
});
test("maximum-length source identifiers survive history and storage", () => {
  const event = { ...sample(), id: "x".repeat(160) };
  const state = engine.applyEvent(
    engine.createInitialState(),
    event,
    8640000000000000,
  );
  const storage = memoryStorage();
  engine.saveState(storage, state);
  assert.deepEqual(engine.loadState(storage), state);
  assert.equal(
    engine.applyEvent(state, sample("oracle", 0), 8640000000000000).history
      .length,
    2,
  );
});
test("storage absence, corruption and exceptions recover to fresh defaults", () => {
  for (const storage of [
    undefined,
    null,
    {},
    {
      getItem() {
        throw Error("blocked");
      },
    },
    ...[
      null,
      "",
      "oops",
      "null",
      "[]",
      "123",
      "true",
      '"hello"',
      '{"history":null}',
    ].map(memoryStorage),
  ]) {
    assert.deepEqual(engine.loadState(storage), engine.createInitialState());
  }
  for (const storage of [
    undefined,
    null,
    {},
    {
      setItem() {
        throw Error("quota");
      },
    },
  ])
    assert.equal(engine.saveState(storage, engine.createInitialState()), false);
  assert.equal(engine.saveState(memoryStorage(), null), false);
  const explosive = new Proxy(
    {},
    {
      get() {
        throw Error("bad getter");
      },
    },
  );
  assert.equal(engine.saveState(memoryStorage(), explosive), false);
});
test("storage validates nested data, strips dangerous keys and bounds numeric fields", () => {
  const dirty = JSON.parse(
    '{"chaos":900,"catastrophes":-2,"universes":1e100,"settings":{"sound":"false","effects":false,"__proto__":{"polluted":true}},"secrets":["logo","logo","constructor"],"achievements":["invented",null],"history":[null,{},42],"actionTrail":["coffee","__proto__","alien"],"__proto__":{"polluted":true}}',
  );
  const result = engine.loadState(memoryStorage(JSON.stringify(dirty)));
  assert.equal(result.chaos, 100);
  assert.equal(result.catastrophes, 0);
  assert.equal(result.universes, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(result.settings, { sound: false, effects: false });
  assert.deepEqual(result.secrets, ["logo"]);
  assert.deepEqual(result.achievements, []);
  assert.deepEqual(result.history, []);
  assert.deepEqual(result.actionTrail, ["coffee", "alien"]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(result, "__proto__"), false);
  for (const value of ["9", null, {}, true]) {
    assert.equal(
      engine.loadState(memoryStorage(JSON.stringify({ chaos: value }))).chaos,
      0,
    );
  }
});
test("storage removes malformed history, bounds strings, sorts and deduplicates occurrence ids", () => {
  const good = { ...sample(), sourceId: "source", id: "occurrence", time: 10 };
  const raw = {
    history: [
      good,
      { ...good, time: 20 },
      { ...good, id: "new", time: 30 },
      { ...good, id: "bad", time: -1 },
      { ...good, id: "bad2", type: "constructor" },
      { ...good, id: "long", description: "a".repeat(10000) },
    ],
    achievements: [engine.ACHIEVEMENTS.first, engine.ACHIEVEMENTS.first],
    settings: [],
  };
  const state = engine.loadState(memoryStorage(JSON.stringify(raw)));
  assert.equal(state.history.length, 2);
  assert.equal(state.history[0].id, "new");
  assert.equal(
    new Set(state.history.map((x) => x.id)).size,
    state.history.length,
  );
  assert.deepEqual(state.achievements, [engine.ACHIEVEMENTS.first]);
  assert.deepEqual(state.settings, { sound: false, effects: true });
  const many = {
    history: Array.from({ length: 170 }, (_, i) => ({
      ...good,
      id: `id-${i}`,
      time: i,
    })),
  };
  assert.equal(
    engine.loadState(memoryStorage(JSON.stringify(many))).history.length,
    150,
  );
});
test("initial state is independent, complete and safe", () => {
  assert.equal(typeof engine.createInitialState, "function");
  const a = engine.createInitialState(),
    b = engine.createInitialState();
  assert.deepEqual(a, {
    chaos: 0,
    catastrophes: 0,
    history: [],
    achievements: [],
    secrets: [],
    settings: { sound: false, effects: true },
    universes: 0,
    actionTrail: [],
  });
  a.history.push("x");
  assert.equal(b.history.length, 0);
});
