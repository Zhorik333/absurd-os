import test from 'node:test';
import assert from 'node:assert/strict';
import * as experiments from '../src/experiments.js';
import {applyEvent,createInitialState} from '../src/engine.js';

test('command validation admits only own data keys and known experiment IDs', () => {
  const command={kind:'experiment',id:experiments.EXPERIMENTS[0].id};
  assert.deepEqual(experiments.validateCommand(command),command); assert.notEqual(experiments.validateCommand(command),command);
  const extraSymbol={...command,[Symbol('hidden')]:'code'};
  const accessor={...command}; Object.defineProperty(accessor,'id',{get(){throw Error('must not execute');}});
  for(const value of [null,[],JSON.stringify(command),{kind:'experiment',id:'missing'},{...command,delta:-99},{...command,code:'alert(1)'},{...command,kind:'restart'},Object.create(command),extraSymbol,accessor,new (class X {constructor(){Object.assign(this,command)}})()]) assert.equal(experiments.validateCommand(value),null);
  assert.equal(experiments.validateCommand(JSON.parse('{"kind":"experiment","id":"double-boris","__proto__":{}}')),null);
});

test('resolution is deterministic, V1 compatible, and never mutates caller state', () => {
  const catalogue=JSON.stringify(experiments.EXPERIMENTS);
  for(const item of experiments.EXPERIMENTS) {
    const yes=experiments.resolveExperiment(item.id,()=>0.1);
    const no=experiments.resolveExperiment(item.id,()=>0.99);
    assert.equal(yes.success,true); assert.ok(yes.event.delta<=0); assert.equal(no.success,false); assert.ok(no.event.delta>0);
    assert.equal(no.catastrophic,no.event.delta>=20); assert.equal(yes.experimentId,item.id);
    for(const result of [yes,no]) {
      assert.ok(['chaos','oracle','alien','money','gravity','coffee'].includes(result.event.type));
      const world=createInitialState(); world.chaos=50; const frozen=JSON.stringify(world);
      const next=applyEvent(world,result.event,123); assert.equal(next.history.length,1); assert.equal(JSON.stringify(world),frozen);
      assert.deepEqual(result,experiments.resolveExperiment(item.id,()=>result.success ? 0.1 : 0.99));
    }
  }
  assert.equal(JSON.stringify(experiments.EXPERIMENTS),catalogue);
  assert.equal(experiments.resolveExperiment('not-real'),null);
});

test('rare roll below .035 introduces a second Boris without losing success sign', () => {
  const rare=experiments.resolveExperiment('quantum-coffee',()=>0.01);
  assert.equal(rare.rare,true); assert.equal(rare.event.sourceId,'double-boris'); assert.match(rare.event.title,/Борис/);
  assert.equal(rare.success,true); assert.ok(rare.event.delta<=0);
  assert.equal(experiments.resolveExperiment('quantum-coffee',()=>0.035).rare,false);
});

test('catalogue contains eight distinct bounded Russian experiments', () => {
  const {EXPERIMENTS}=experiments;
  assert.ok(EXPERIMENTS.length>=8); assert.equal(new Set(EXPERIMENTS.map(e=>e.id)).size,EXPERIMENTS.length);
  assert.equal(new Set(EXPERIMENTS.map(e=>e.animation)).size,EXPERIMENTS.length, 'each experiment has a unique visual signature');
  for(const item of EXPERIMENTS) {
    for(const key of ['id','title','description','consequences','animation','emoji']) assert.ok(typeof item[key]==='string' && item[key].length>0);
    assert.ok(item.probability>=0 && item.probability<=1); assert.ok(['low','medium','high'].includes(item.risk));
  }
});
