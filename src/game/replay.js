import { COURSE_VERSION, createCourseSeed, isValidAddress, isValidSignature, TRANSACTION_LIMIT } from '../blockchain/solana.js';
import { createDemoCourse, DEMO_WALLET } from '../blockchain/demo.js';
import { MAX_RUN_TIME as MAX_TIME } from './engine.js';

const STORAGE_KEY = 'sol-heist-runs-v1';
const MAX_FRAMES = 27_001;
const MAX_URL = 7500;
const ANIMATIONS = ['idle', 'run', 'jump', 'doubleJump', 'fall', 'landing', 'slide', 'collect', 'damage', 'hack', 'victory', 'defeat', 'walk', 'sneak'];

function validFrames(frames) {
  if (!Array.isArray(frames) || !frames.length || frames.length > MAX_FRAMES) return false;
  let previous = -1;
  return frames.every((frame) => {
    if (!frame || !Number.isFinite(frame.t) || frame.t < 0 || frame.t > MAX_TIME || frame.t <= previous ||
      !Number.isFinite(frame.x) || Math.abs(frame.x) > 10_000 || !Number.isFinite(frame.y) || Math.abs(frame.y) > 1000) return false;
    previous = frame.t;
    return true;
  });
}

export function sampleReplay(frames, time) {
  if (!frames?.length || !Number.isFinite(time)) return null;
  if (time <= frames[0].t) return frames[0];
  if (time >= frames.at(-1).t) return frames.at(-1);
  let low = 0;
  let high = frames.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (frames[middle].t <= time) low = middle;
    else high = middle;
  }
  const a = frames[low];
  const b = frames[high];
  const mix = (time - a.t) / (b.t - a.t);
  // Checkpoint teleports stay discrete instead of dragging the ghost through walls.
  if (Math.hypot(b.x - a.x, b.y - a.y) > 8) return { ...a, t: time };
  const frame = { ...a, t: time, x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
  if (a.security && b.security) {
    frame.security = { ...a.security };
    for (const key of ['enemies', 'projectiles']) {
      frame.security[key] = a.security[key].map((actor) => {
        const next = b.security[key].find((entry) => entry.id === actor.id);
        return next ? { ...actor, x: actor.x + (next.x - actor.x) * mix, y: actor.y + (next.y - actor.y) * mix } : actor;
      });
    }
  }
  return frame;
}

// Playback consumes recorded state only; it never advances enemy AI or physics.
export function applyReplay(game, replay, time) {
  const frame = sampleReplay(replay.frames, time);
  if (!frame) return;
  const { security, ...player } = frame;
  Object.assign(game.player, player);
  game.time = time;
  if (security) {
    for (const key of ['enemies', 'lasers', 'cameras', 'terminals', 'projectiles']) {
      game[key] = (security[key] || []).map(actor => ({ ...game.level[key]?.find(e => e.id === actor.id), ...actor }));
    }
    game.alarm = security.alarm;
    game.disabledUntil = security.disabledUntil;
    game.player.health = security.health;
    game.player.invincible = security.invincible;
  } else {
    // Older saved ghosts have no world snapshots; don't invent security movement.
    game.enemies = []; game.lasers = []; game.cameras = []; game.projectiles = [];
  }
  game.events = (replay.events || []).filter(event => event.time <= time);
  game.collected = new Set(game.events.filter(event => event.type === 'collect').map(event => event.artifactId));
  game.vaultOpen = game.events.some(event => event.type === 'vault');
  game.zone = Math.max(0, game.level.zones.findIndex(zone => game.player.x >= zone.start && game.player.x < zone.end));
}

function validRun(run) {
  return run && Number.isFinite(run.time) && run.time > 0 && run.time <= MAX_TIME &&
    Number.isFinite(run.score) && run.score >= 0 && run.score <= 1e9 && validFrames(run.frames) &&
    run.frames.at(-1).t <= run.time + 1;
}

function readRuns() {
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!text || text.length > 12_000_000) return [];
    const records = JSON.parse(text);
    if (!Array.isArray(records)) return [];
    return records.slice(0, 5).filter((record) => typeof record.courseId === 'string' && record.courseId.length <= 128 && validRun(record.best));
  } catch { return []; }
}

export function getBestRun(courseId) {
  return readRuns().find((record) => record.courseId === courseId)?.best || null;
}

export function getLastRun(courseId) {
  const run = readRuns().find((record) => record.courseId === courseId)?.last;
  return validRun(run) ? run : null;
}

export function getBestRuns() {
  return readRuns().map(({ courseId, best }) => ({ ...best, courseId })).sort((a, b) => a.time - b.time);
}

export function saveRun(courseId, run) {
  if (typeof courseId !== 'string' || !courseId || courseId.length > 128 || !validRun(run)) throw new Error('This run could not be saved because its recording is invalid.');
  const records = readRuns();
  const previousBest = records.find((record) => record.courseId === courseId)?.best || null;
  const isBest = !previousBest || run.time < previousBest.time;
  const last = {
    time: run.time, score: run.score, wallet: typeof run.wallet === 'string' ? run.wallet.slice(0, 64) : 'DEMO',
    // Local records retain lightweight player ghosts; the current cinematic keeps its full world snapshots.
    frames: run.frames.map(({ t, x, y, vx, vy, grounded, facing, animation, sliding }) => ({ t, x, y, facing: facing < 0 ? -1 : 1, animation: ANIMATIONS.includes(animation) ? animation : 'idle', sliding: Boolean(sliding),
      ...(Number.isFinite(vx) ? { vx } : {}), ...(Number.isFinite(vy) ? { vy } : {}), ...(typeof grounded === 'boolean' ? { grounded } : {}),
    })),
    events: (Array.isArray(run.events) ? run.events : []).slice(0, 2000).filter((event) => Number.isFinite(event.time) && event.time >= 0 && event.time <= MAX_TIME).map((event) => ({
      type: String(event.type).slice(0, 32), time: event.time,
      x: Number.isFinite(event.x) ? event.x : 0, y: Number.isFinite(event.y) ? event.y : 0,
      ...(typeof event.id === 'string' ? { id: event.id.slice(0, 100) } : {}),
      ...(typeof event.artifactId === 'string' ? { artifactId: event.artifactId.slice(0, 100) } : {}),
    })),
    artifacts: Array.isArray(run.artifacts) ? run.artifacts.slice(0, TRANSACTION_LIMIT) : [],
    damageTaken: Number.isFinite(run.damageTaken) ? run.damageTaken : 0,
    alerts: Number.isFinite(run.alerts) ? run.alerts : 0,
    createdAt: Date.now(),
  };
  const best = isBest ? last : previousBest;
  const next = [{ courseId, best, last }, ...records.filter((record) => record.courseId !== courseId)].slice(0, 5);
  let saved = false;
  try {
    if (globalThis.localStorage) { globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); saved = true; }
  } catch { /* The current replay still works when browser storage is full or unavailable. */ }
  return { isBest, best, previousBest, saved };
}

function encodeGhost(frames) {
  if (!validFrames(frames)) return null;
  const selected = [frames[0]];
  for (let i = 1; i < frames.length - 1; i++) if (frames[i].t - selected.at(-1).t >= 1 / 3) selected.push(frames[i]);
  if (frames.length > 1) selected.push(frames.at(-1));
  if (selected.length > 425) return null;
  const bytes = new Uint8Array(3 + selected.length * 13);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  view.setUint16(1, selected.length);
  selected.forEach((frame, i) => {
    const offset = 3 + i * 13;
    view.setUint32(offset, Math.round(frame.t * 1000));
    view.setInt32(offset + 4, Math.round(frame.x * 100));
    view.setInt32(offset + 8, Math.round(frame.y * 100));
    const animation = Math.max(0, ANIMATIONS.indexOf(frame.animation));
    bytes[offset + 12] = animation | (frame.facing < 0 ? 32 : 0) | (frame.sliding ? 64 : 0);
  });
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeGhost(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > MAX_URL) throw new Error('Invalid shared ghost recording.');
  let bytes;
  try { bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0)); }
  catch { throw new Error('Invalid shared ghost recording.'); }
  if (bytes.length < 16 || bytes[0] !== 1) throw new Error('Unsupported ghost recording.');
  const view = new DataView(bytes.buffer);
  const count = view.getUint16(1);
  if (count > 425 || bytes.length !== 3 + count * 13) throw new Error('Invalid shared ghost size.');
  const frames = [];
  for (let i = 0; i < count; i++) {
    const offset = 3 + i * 13;
    const flags = bytes[offset + 12];
    if (flags > 127 || (flags & 31) >= ANIMATIONS.length) throw new Error('Invalid shared ghost animation.');
    frames.push({
      t: view.getUint32(offset) / 1000, x: view.getInt32(offset + 4) / 100, y: view.getInt32(offset + 8) / 100,
      animation: ANIMATIONS[flags & 31], facing: flags & 32 ? -1 : 1, sliding: Boolean(flags & 64),
    });
  }
  if (!validFrames(frames)) throw new Error('Invalid shared ghost movement.');
  return { frames, time: frames.at(-1).t };
}

export function buildChallengeUrl(course, { frames } = {}) {
  const url = new URL(globalThis.location?.href || 'http://localhost:5173/');
  url.search = '';
  url.hash = '';
  url.searchParams.set('v', COURSE_VERSION);
  url.searchParams.set('wallet', course.wallet);
  url.searchParams.set('seed', createCourseSeed(course.wallet, course.signatures));
  if (course.wallet !== DEMO_WALLET) url.searchParams.set('tx', course.signatures.join(','));
  parseChallenge(url);
  const encoded = frames && encodeGhost(frames);
  if (encoded) url.searchParams.set('ghost', encoded);
  if (url.href.length > MAX_URL) url.searchParams.delete('ghost');
  if (url.href.length > MAX_URL) throw new Error('This course link exceeds the safe sharing size.');
  return { url: url.href, includesGhost: url.searchParams.has('ghost') };
}

export function parseChallenge(location = globalThis.location) {
  if (!location) return null;
  const href = typeof location === 'string' ? location : location.href || `http://localhost/${location.search || ''}`;
  const url = new URL(href, 'http://localhost/');
  const params = url.searchParams;
  if (!params.has('wallet') && !params.has('v') && !params.has('tx') && !params.has('seed')) return null;
  if (url.href.length > MAX_URL) throw new Error('This challenge link is too large.');
  for (const key of ['v', 'wallet', 'tx', 'seed', 'ghost']) if (params.getAll(key).length > 1) throw new Error('This challenge has conflicting settings.');
  if (params.get('v') !== COURSE_VERSION) throw new Error('This challenge uses an unsupported game version.');
  const wallet = params.get('wallet');
  if (wallet !== DEMO_WALLET && !isValidAddress(wallet)) throw new Error('This challenge has an invalid public wallet.');
  const signatures = wallet === DEMO_WALLET ? createDemoCourse().signatures : (params.get('tx') || '').split(',');
  if (wallet === DEMO_WALLET && params.has('tx')) throw new Error('Demo challenges cannot override the sample transaction window.');
  if (wallet !== DEMO_WALLET && (!signatures.length || signatures.length > TRANSACTION_LIMIT || !signatures.every(isValidSignature) || new Set(signatures).size !== signatures.length)) throw new Error('This challenge has an invalid transaction window.');
  const seed = createCourseSeed(wallet, signatures);
  if (params.get('seed') !== seed) throw new Error('This challenge has inconsistent course settings.');
  return { wallet, signatures, seed, version: COURSE_VERSION, ...(params.has('ghost') ? { ghost: decodeGhost(params.get('ghost')) } : {}) };
}
