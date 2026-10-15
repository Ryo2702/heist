import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.js';
import { generateLevel } from '../src/game/levels.js';
import { createDemoCourse } from '../src/blockchain/demo.js';
import { applyReplay } from '../src/game/replay.js';
import { spriteFrame, SPRITE_STATES, CELL_W, CELL_H, FRAMES, groceryName, groceryKind } from '../src/game/sprites.js';

test('CCTV restores actual pickups, door events and recorded security without simulating movement', () => {
  const game = createGame(generateLevel(createDemoCourse()));
  const security = { alarm: 45, health: 3, invincible: 0, disabledUntil: 0,
    enemies: [{id:'guardian-0',x:86,y:0,state:'chase',facing:-1}], lasers: [], cameras: [], terminals: [], projectiles: [] };
  const replay = {frames:[{t:0,x:2,y:0,animation:'idle',security},{t:2,x:4,y:0,animation:'walk',security}],
    events:[{type:'collect',artifactId:game.level.artifacts[0].id,time:.5},{type:'vault',time:1.5}]};
  applyReplay(game,replay,1);
  assert.equal(game.player.x,3); assert.equal(game.enemies[0].x,86); assert.equal(game.enemies[0].type,'guardian');
  assert.equal(game.player.health,3); assert.equal(game.alarm,45); assert.equal(game.collected.size,1); assert.equal(game.vaultOpen,false);
  applyReplay(game,replay,2); assert.equal(game.vaultOpen,true);
  applyReplay(game,replay,0); assert.equal(game.collected.size,0); assert.equal(game.vaultOpen,false);
});

test('all mascot states select bounded atlas cells and grocery labels preserve metadata', () => {
  for (const state of SPRITE_STATES) for (const time of [0,.13,100,1800]) {
    const cell=spriteFrame(state,time);
    assert.ok(cell.x>=0 && cell.x<CELL_W*FRAMES && cell.x%CELL_W===0);
    assert.ok(cell.y>=0 && cell.y<CELL_H*SPRITE_STATES.length && cell.y%CELL_H===0);
  }
  assert.equal(SPRITE_STATES.length,14);
  const artifact={type:'sol',signature:'original',slot:123};
  assert.equal(groceryName(artifact),'Golden onion'); assert.equal(artifact.signature,'original'); assert.equal(artifact.slot,123);
});

test('every artifact has a matching onion or garlic label and appearance without changing metadata', () => {
  for (const [type, kind, name] of [
    ['sol', 'onion', 'Golden onion'], ['token', 'garlic', 'Fresh garlic'],
    ['failed', 'onion', 'Bruised onion'], ['high-fee', 'garlic', 'Premium garlic'],
    ['early', 'onion', 'Red onion'], ['unknown', 'onion', 'Onion'],
  ]) {
    const artifact = Object.freeze({ type, signature: 'original', slot: 123 });
    assert.equal(groceryKind(artifact), kind);
    assert.equal(groceryName(artifact), name);
    assert.deepEqual(artifact, { type, signature: 'original', slot: 123 });
  }
});
