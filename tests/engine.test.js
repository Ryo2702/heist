import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, platformPosition } from '../src/game/levels.js';
import { createGame, stepGame, makeSnapshot, FIXED_STEP, MAX_RUN_TIME } from '../src/game/engine.js';
import { createDemoCourse } from '../src/blockchain/demo.js';
import { buildChallengeUrl, getBestRun, getLastRun, parseChallenge, saveRun } from '../src/game/replay.js';

const samples = Array.from({ length: 12 }, (_, index) => ({ signature: `sample-${index}`, title: 'SAMPLE TRANSACTION' }));
const level = (seed = 'test-course') => generateLevel({ seed, artifacts: samples });
function tick(game, seconds, input = {}) {
  for (let index = 0; index < Math.ceil(seconds / FIXED_STEP); index += 1) stepGame(game, input, FIXED_STEP);
}
function start(course = level()) {
  const game = createGame(course);
  tick(game, 3.01);
  return game;
}

test('course and artifact metadata are deterministic, with a continuous valid ground route', () => {
  assert.deepEqual(level(), level());
  assert.notEqual(level('different').id, level().id);
  assert.notEqual(generateLevel({ seed: 'test-course', artifacts: samples, version: '2' }).id, level().id);
  for (let index = 0; index < 100; index += 1) {
    const course = level(`wallet-${index}`);
    const floors = course.platforms.filter((platform) => platform.floor);
    assert.equal(floors[0].x - floors[0].w / 2, 0);
    assert.equal(floors.at(-1).x + floors.at(-1).w / 2, course.length);
    for (let floor = 1; floor < floors.length; floor += 1) assert.equal(floors[floor].x - floors[floor].w / 2, floors[floor - 1].x + floors[floor - 1].w / 2);
    assert.equal(course.artifacts[0].signature, 'sample-0');
    assert.ok(course.platforms.filter((platform) => !platform.floor).every((platform) => platform.y <= 2.75));
  }
});

test('countdown prevents movement, standing collision lands and variable jump height works', () => {
  const game = createGame(level());
  tick(game, 1, { right: true });
  assert.equal(game.player.x, 2);
  assert.equal(game.time, 0);
  tick(game, 2.1);
  stepGame(game, { jump: true, jumpPressed: true });
  tick(game, 0.3, { jump: true });
  const highJump = game.player.y;
  const short = start();
  stepGame(short, { jump: true, jumpPressed: true });
  tick(short, 0.3);
  assert.ok(highJump > short.player.y + 0.4);
  tick(game, 2);
  assert.equal(game.player.y, 0);
  assert.equal(game.player.grounded, true);
});

test('slide fits the tunnel and cannot stand up through its ceiling', () => {
  const game = start();
  game.lasers = [];
  game.enemies = [];
  game.player.x = 60;
  game.player.sliding = true;
  tick(game, 0.2);
  assert.equal(game.player.sliding, true);
  tick(game, 0.6, { right: true, slide: true });
  tick(game, 0.1);
  assert.equal(game.player.sliding, false);
  assert.ok(game.player.x > 62);
});

test('terminal hold disables security, recordings contain actual positions, paused states do not advance', () => {
  const game = start();
  game.player.x = 47;
  tick(game, 1.1, { interact: true });
  assert.ok(game.disabledUntil > game.time + 9);
  assert.ok(game.events.some((entry) => entry.type === 'hack'));
  assert.ok(game.recording.length > 10);
  const snapshot = makeSnapshot(game);
  assert.equal(snapshot.securityDisabled, true);
  assert.equal(typeof snapshot.zone, 'string');
  game.status = 'paused';
  const time = game.time;
  tick(game, 2, { right: true });
  assert.equal(game.time, time);
});

test('falling returns to checkpoint and health or countdown can end a run', () => {
  const game = start();
  game.player.y = -8;
  stepGame(game);
  assert.equal(game.player.y, game.checkpoint.y);
  assert.equal(game.player.health, 4);
  game.escapeRemaining = FIXED_STEP;
  game.recordAt = 0;
  stepGame(game);
  assert.equal(game.status, 'lost');
  assert.ok(game.recording.every((frame, index, frames) => !index || frame.t > frames[index - 1].t));
  assert.equal(game.recording.at(-1).animation, 'defeat');
  const final = makeSnapshot(game);
  tick(game, 2);
  assert.deepEqual(makeSnapshot(game), final);
  const fatalFall = start();
  fatalFall.player.health = 1;
  fatalFall.player.y = -8;
  stepGame(fatalFall);
  assert.equal(fatalFall.status, 'lost');
  assert.equal(fatalFall.player.animation, 'defeat');
  assert.equal(fatalFall.recording.at(-1).y, Number(fatalFall.player.y.toFixed(3)));
});

test('locked vault blocks the escape route until its artifact requirement and hack are complete', () => {
  const game = start();
  game.enemies = [];
  game.cameras = [];
  game.player.x = 112;
  tick(game, 1, { right: true, sprint: true, interact: true });
  assert.equal(game.vaultOpen, false);
  assert.ok(game.player.x < game.level.vault.x);
  game.level.artifacts.slice(0, 3).forEach((artifact) => game.collected.add(artifact.id));
  tick(game, 0.8, { interact: true });
  assert.equal(game.vaultOpen, true);
  tick(game, 1, { right: true, slide: true });
  assert.ok(game.player.x > game.level.vault.x);
});

test('a thirty-minute run limit keeps unattended recordings bounded and finishes once', () => {
  const game = start();
  game.time = MAX_RUN_TIME - FIXED_STEP / 2;
  stepGame(game);
  assert.equal(game.status, 'lost');
  assert.equal(game.time, MAX_RUN_TIME);
  assert.equal(game.recording.at(-1).t, MAX_RUN_TIME);
  const recorded = game.recording.length;
  tick(game, 1);
  assert.equal(game.recording.length, recorded);
  assert.equal(game.events.filter((event) => event.type === 'defeat').length, 1);
});

test('a simulated demo run collects artifacts, unlocks the vault, persists and shares the same course', (t) => {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } });
  t.after(() => delete globalThis.localStorage);
  const course = createDemoCourse();
  const game = start(generateLevel(course));
  let jumpHeld = 0;
  for (let frame = 0; frame < 120 * 100 && game.status === 'playing'; frame += 1) {
    const player = game.player;
    const vault = !game.vaultOpen && player.x > 112.7;
    const nearbyLaser = game.lasers.find((laser) => laser.x > player.x && laser.x - player.x < 1.15);
    const wait = nearbyLaser && (nearbyLaser.active || nearbyLaser.warning);
    const guardian = game.enemies.find((enemy) => enemy.type === 'guardian' && enemy.x - player.x > 0 && enemy.x - player.x < 3.3);
    const jumpPressed = Boolean(guardian && player.grounded && jumpHeld <= 0);
    if (jumpPressed) jumpHeld = 0.55;
    jumpHeld -= FIXED_STEP;
    stepGame(game, { right: !vault && !wait, sprint: true, slide: !guardian && jumpHeld <= 0, jump: jumpHeld > 0, jumpPressed, interact: vault }, FIXED_STEP);
  }
  assert.equal(game.status, 'won', `bot ended ${game.status} at x=${game.player.x}, hp=${game.player.health}, artifacts=${game.collected.size}`);
  assert.ok(game.collected.size >= 3);
  assert.ok(game.vaultOpen);
  assert.ok(game.time > 15 && game.time < 100);
  assert.equal(game.recording.at(-1).animation, 'victory');
  assert.ok(game.events.some((entry) => entry.type === 'vault'));
  const finalFrame = game.recording.at(-1);
  assert.equal(finalFrame.security.alarm, game.alarm);
  assert.equal(finalFrame.security.health, game.player.health);
  assert.equal(finalFrame.security.enemies[0].x, Number(game.enemies[0].x.toFixed(3)));
  assert.notEqual(game.recording[0].security.enemies[0].x, finalFrame.security.enemies[0].x);
  const artifacts = game.level.artifacts.filter((artifact) => game.collected.has(artifact.id));
  const run = { time: game.time, score: game.score, wallet: course.wallet, frames: game.recording, events: game.events, artifacts };
  assert.equal(saveRun(game.level.id, run).saved, true);
  const stored = getBestRun(game.level.id);
  assert.equal(stored.time, game.time);
  assert.equal(getLastRun(game.level.id).artifacts.length, game.collected.size);
  assert.deepEqual(stored.events.filter((event) => event.type === 'collect').map((event) => event.artifactId), [...game.collected]);
  assert.ok(stored.frames.every((frame, index) => frame.animation === game.recording[index].animation));
  const shared = parseChallenge(buildChallengeUrl(course, { frames: stored.frames }).url);
  assert.equal(generateLevel({ ...course, seed: shared.seed }).id, game.level.id);
  assert.equal(shared.ghost.frames.at(-1).animation, 'victory');
  assert.equal(shared.ghost.time, game.recording.at(-1).t);
});

test('elevators remain within the declared reachable range', () => {
  const platform = level().platforms.find((entry) => entry.moving);
  for (let time = 0; time < 10; time += 0.1) assert.ok(Math.abs(platformPosition(platform, time).y - platform.y) <= platform.moving.amplitude);
});
