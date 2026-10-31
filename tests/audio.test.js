import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getStatus } from '../src/engine.js';

// Bundle only the component for server rendering; no app bootstrap or audio autoplay.
test('camera retains its SVG eye, exact chaos boundaries and accessible status', async () => {
  const source = await readFile(new URL('../src/Anomaly.jsx', import.meta.url), 'utf8').catch(() => '');
  assert.ok(source, 'standalone camera component exists');
  const result = await build({ stdin: { contents: source, loader: 'jsx', resolveDir: new URL('../src/', import.meta.url).pathname },
    bundle: true, write: false, format: 'esm', platform: 'node', external: ['react'], loader: { '.css': 'empty' } });
  // Resolve React from the project rather than a data URL's nonexistent package directory.
  const code = result.outputFiles[0].text.replaceAll('from "react"', `from "${import.meta.resolve('react')}"`);
  const { default: Anomaly } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  for (const [chaos, stage] of [[0, 0], [20, 0], [21, 1], [40, 1], [41, 2], [60, 2], [61, 3], [80, 3], [81, 4], [99, 4], [100, 5]]) {
    const html = renderToStaticMarkup(React.createElement(Anomaly, { chaos, effects: true }));
    assert.match(html, /data-testid="anomaly-camera"/);
    assert.ok(html.includes(`data-stage="${stage}"`));
    assert.ok(html.includes(getStatus(chaos)));
    assert.match(html, /class="outer-ring"/);
    assert.match(html, /M157 180 Q250 75 343 180 Q250 285 157 180Z/);
    assert.match(html, /role="status"/);
  }
});
const audio = await import('../src/audio.js').catch(() => ({}));

function fakeContext({ rejectResume = false } = {}) {
  const instances = [];
  class Context {
    constructor() { this.currentTime = 10; this.destination = {}; this.notes = []; this.gains = []; instances.push(this); }
    resume() { return rejectResume ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    createOscillator() {
      const note = { frequency: { setValueAtTime: (value, time) => { note.value = value; note.time = time; } },
        connect() {}, start(time) { note.start = time; }, stop(time) { note.stop = time; } };
      this.notes.push(note); return note;
    }
    createGain() {
      const values = []; this.gains.push(values);
      return { gain: { setValueAtTime(value) { values.push(value); }, exponentialRampToValueAtTime(value) { values.push(value); } }, connect() {} };
    }
  }
  return { Context, instances };
}

test('legacy event notes are exact, scheduling is lazy and context is reused', () => {
  const { Context, instances } = fakeContext();
  assert.equal(instances.length, 0);
  for (const [type, notes] of Object.entries({ event: [220, 440, 660], alarm: [660, 440, 660], end: [440, 330, 220, 110] })) {
    assert.equal(audio.playSound(type, true, Context), true);
    assert.deepEqual(instances[0].notes.splice(0).map(n => n.value), notes);
  }
  assert.equal(instances.length, 1);
});

test('nine named Russian channels have distinct synths', () => {
  const expected = ['event', 'alarm', 'end', 'notification', 'error', 'anomaly', 'experiment', 'success', 'boris'];
  assert.deepEqual(audio.SOUND_CHANNELS, expected);
  const signatures = [];
  for (const channel of expected) {
    assert.match(audio.SOUND_LABELS[channel], /[А-Яа-яЁё]/);
    const { Context, instances } = fakeContext();
    assert.equal(audio.playSound(channel, { sound: true }, Context), true);
    signatures.push(JSON.stringify(instances[0].notes.map(n => [n.value, n.type])));
  }
  assert.equal(new Set(signatures).size, expected.length);
});

test('channel switches, zero and negative volumes mute before context creation', () => {
  const { Context, instances } = fakeContext();
  for (const settings of [{ sound: true, channels: { event: false } }, { sound: true, volume: 0 }, { sound: true, volume: -5 }]) {
    assert.equal(audio.playSound('event', settings, Context), false);
  }
  assert.equal(instances.length, 0);
});

test('volume is clamped, defaults to .45, and all envelope ramps are positive and bounded', () => {
  for (const [volume, expected] of [[undefined, .065 * .45], [.2, .065 * .2], [10, .065], [NaN, .065 * .45]]) {
    const { Context, instances } = fakeContext();
    assert.equal(audio.playSound('event', { sound: true, volume }, Context), true);
    assert.equal(Math.max(...instances[0].gains.flat()), expected);
    assert.ok(instances[0].gains.flat().every(v => v > 0 && v <= .065));
    for (const note of instances[0].notes) assert.ok(note.stop > note.start);
  }
});

test('unknown channels, unsupported audio and failed constructors safely return false', () => {
  const { Context, instances } = fakeContext();
  for (const channel of ['unfamiliar', '__proto__', 'toString']) assert.equal(audio.playSound(channel, true, Context), false);
  assert.equal(instances.length, 0);
  assert.equal(audio.playSound('event', true, null), false);
  assert.equal(audio.playSound('event', true, class { constructor() { throw Error('unsupported'); } }), false);
});

test('rejected resume is handled without unhandled promise rejections', async () => {
  const { Context } = fakeContext({ rejectResume: true });
  assert.equal(audio.playSound('event', true, Context), true);
  await new Promise(resolve => setImmediate(resolve));
});

test('sound defaults to off and never constructs a context while muted', () => {
  let constructions = 0;
  class Context { constructor() { constructions++; } }
  assert.equal(typeof audio.playSound, 'function');
  assert.equal(audio.playSound('event', undefined, Context), false);
  assert.equal(audio.playSound('event', false, Context), false);
  assert.equal(audio.playSound('event', { sound: false }, Context), false);
  assert.equal(constructions, 0);
});
