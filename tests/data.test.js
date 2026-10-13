import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseSeed, fetchWalletArtifacts, isValidAddress, isValidSignature, transactionToArtifact } from '../src/blockchain/solana.js';
import { createDemoCourse, DEMO_ARTIFACTS } from '../src/blockchain/demo.js';
import { buildChallengeUrl, getBestRun, getBestRuns, getLastRun, parseChallenge, sampleReplay, saveRun } from '../src/game/replay.js';
import { generateLevel } from '../src/game/levels.js';

const address = (digit = '2') => '1'.repeat(31) + digit;
const signature = (digit = '2') => '1'.repeat(63) + digit;
const mint = 'So11111111111111111111111111111111111111112';
const response = (result) => ({ ok: true, status: 200, json: async () => ({ result }) });
const row = (digit = '2') => ({ signature: signature(digit), slot: 42, blockTime: 1_700_000_000, err: null });
function transaction(wallet = address(), digit = '2', extra = {}) {
  return {
    slot: 42, blockTime: 1_700_000_000,
    transaction: { signatures: [signature(digit)], message: { accountKeys: [{ pubkey: wallet }], instructions: [] } },
    meta: { err: null, fee: 5000, preBalances: [2e9], postBalances: [1e9 - 5000], preTokenBalances: [], postTokenBalances: [] },
    ...extra,
  };
}
const frames = Array.from({ length: 151 }, (_, i) => ({ t: i / 15, x: i / 3, y: Math.sin(i / 10), facing: 1, animation: i % 20 < 10 ? 'run' : 'jump', sliding: false }));

test('base58 validation checks decoded byte count and excludes ambiguous characters', () => {
  assert.equal(isValidAddress(address()), true);
  assert.equal(isValidAddress(mint), true);
  assert.equal(isValidAddress('1'.repeat(32)), true);
  for (const invalid of ['', '1'.repeat(31), '1'.repeat(33), '0'.repeat(32), 'z'.repeat(44), null, {}]) assert.equal(isValidAddress(invalid), false);
  assert.equal(isValidSignature(signature()), true);
  assert.equal(isValidSignature('1'.repeat(63)), false);
});

test('demo is explicit, detached from blockchain and deterministic', () => {
  const first = createDemoCourse();
  const second = createDemoCourse();
  assert.deepEqual(first, second);
  assert.ok(first.artifacts.every((artifact) => artifact.sample && artifact.description.includes('Fictional')));
  first.artifacts[0].label = 'changed';
  assert.notEqual(second.artifacts[0].label, 'changed');
  assert.equal(DEMO_ARTIFACTS.length, 12);
  assert.notEqual(createCourseSeed(address(), [signature('2'), signature('3')]), createCourseSeed(address(), [signature('3'), signature('2')]));
});

test('SOL transfers require parsed System Program transfers involving the wallet', () => {
  const tx = transaction();
  tx.transaction.message.instructions.push({ programId: '11111111111111111111111111111111', parsed: { type: 'transfer', info: { source: address(), destination: address('3'), lamports: 1e9 } } });
  const artifact = transactionToArtifact(tx, row(), address());
  assert.equal(artifact.type, 'sol');
  assert.equal(artifact.feeLamports, 5000);
  assert.equal(artifact.lamportChange, -1_000_005_000);
  assert.equal(artifact.transfers[0].lamports, 1e9);
  tx.transaction.message.instructions[0].programId = mint;
  assert.equal(transactionToArtifact(tx, row(), address()).type, 'unknown');
});

test('unknown transactions remain unclassified and unsafe numbers are not shown', () => {
  const tx = transaction();
  tx.meta.fee = Number.MAX_SAFE_INTEGER + 1;
  tx.meta.preBalances[0] = Number.MAX_SAFE_INTEGER + 1;
  const artifact = transactionToArtifact(tx, row(), address());
  assert.equal(artifact.type, 'unknown');
  assert.equal(artifact.solChange, null);
  assert.equal(artifact.feeLamports, null);
  assert.equal(transactionToArtifact(null, row(), address()).detailsAvailable, false);
});

test('failure and high-fee rarity use verified metadata and explicit threshold', () => {
  const tx = transaction();
  tx.meta.fee = 100_000;
  assert.equal(transactionToArtifact(tx, row(), address()).type, 'high-fee');
  tx.meta.err = { InstructionError: [0, 'Custom'] };
  assert.equal(transactionToArtifact(tx, row(), address()).type, 'failed');
  tx.meta.err = null;
  tx.meta.fee = 99_999;
  assert.equal(transactionToArtifact(tx, row(), address()).type, 'unknown');
});

test('token deltas use exact integer strings beyond JavaScript safe integer range', () => {
  const tx = transaction();
  const token = { accountIndex: 1, mint, owner: address(), uiTokenAmount: { amount: '18446744073709551610', decimals: 6 } };
  tx.meta.preTokenBalances = [token];
  tx.meta.postTokenBalances = [{ ...token, uiTokenAmount: { amount: '18446744073709551611', decimals: 6 } }];
  const artifact = transactionToArtifact(tx, row(), address());
  assert.equal(artifact.type, 'token');
  assert.deepEqual(artifact.tokenChanges, [{ mint, decimals: 6, rawChange: '1', change: '0.000001' }]);
  delete tx.meta.postTokenBalances[0].owner;
  assert.deepEqual(transactionToArtifact(tx, row(), address()).tokenChanges, []);
});

test('RPC uses only bounded reads, two workers, and an expiring detached cache', async (t) => {
  const calls = [];
  const progress = [];
  let active = 0;
  let peak = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    if (request.method === 'getSignaturesForAddress') return response(['2', '3', '4', '5'].map(row));
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return response(transaction(address('4'), request.params[0].at(-1)));
  });
  const course = await fetchWalletArtifacts(address('4'), { onProgress: (value) => progress.push(value) });
  assert.equal(peak, 2);
  assert.equal(course.artifacts.length, 4);
  assert.equal(course.source, 'live');
  assert.equal(calls[0].params[1].limit, 12);
  assert.ok(calls.every((call) => ['getSignaturesForAddress', 'getTransaction'].includes(call.method)));
  assert.equal(calls[1].params[1].maxSupportedTransactionVersion, 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(course.artifacts.some((artifact) => artifact.windowHighlight.includes('not necessarily')));
  course.artifacts[0].label = 'tampered';
  const cached = await fetchWalletArtifacts(address('4'));
  assert.equal(calls.length, 5);
  assert.notEqual(cached.artifacts[0].label, 'tampered');
  const shared = parseChallenge(buildChallengeUrl(cached).url);
  const pinned = await fetchWalletArtifacts(shared.wallet, { signatures: shared.signatures });
  assert.deepEqual(generateLevel(pinned), generateLevel(cached));
});

test('invalid addresses and cancelled requests never reach the network', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network'); });
  await assert.rejects(fetchWalletArtifacts('invalid'), { code: 'INVALID_ADDRESS' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchWalletArtifacts(address(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 0);
});

test('empty history, rate limiting, and unavailable RPC give actionable failures', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response([]));
  await assert.rejects(fetchWalletArtifacts(address('5')), { code: 'EMPTY_HISTORY' });
  fetch.mock.mockImplementation(async () => ({ ok: false, status: 429 }));
  await assert.rejects(fetchWalletArtifacts(address('5')), { code: 'RATE_LIMIT' });
  fetch.mock.mockImplementation(async () => ({ ok: false, status: 503 }));
  await assert.rejects(fetchWalletArtifacts(address('5')), { code: 'UNAVAILABLE' });
});

test('missing details retain only signature facts, while pinned courses reject incomplete reads', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => response(JSON.parse(options.body).method === 'getSignaturesForAddress' ? [row()] : null));
  const course = await fetchWalletArtifacts(address('6'));
  assert.equal(course.artifacts[0].signature, signature());
  assert.equal(course.artifacts[0].feeLamports, null);
  assert.equal(course.artifacts[0].type, 'unknown');
  assert.ok(course.warnings.length);
  await assert.rejects(fetchWalletArtifacts(address('6'), { signatures: [signature()] }), { code: 'MISSING_DETAILS' });
});

test('unsupported transaction versions stay explicit and do not fabricate transfers', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => JSON.parse(options.body).method === 'getSignaturesForAddress' ? response([row()]) : { ok: true, status: 200, json: async () => ({ error: { code: -32015 } }) });
  const course = await fetchWalletArtifacts(address('7'));
  assert.equal(course.artifacts[0].type, 'unknown');
  assert.match(course.warnings[0], /version/);
  await assert.rejects(fetchWalletArtifacts(address('7'), { signatures: [signature()] }), { code: 'UNSUPPORTED_VERSION' });
});

test('pinned signatures cannot substitute a transaction from another wallet', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response(transaction(address('9'))));
  await assert.rejects(fetchWalletArtifacts(address('8'), { signatures: [signature()] }), { code: 'INVALID_RESPONSE' });
});

test('replay interpolates the actual samples and keeps teleports discrete', () => {
  const path = [{ t: 0, x: 0, y: 0, animation: 'jump' }, { t: 1, x: 2, y: 4, animation: 'fall' }];
  assert.deepEqual(sampleReplay(path, 0.5), { t: 0.5, x: 1, y: 2, animation: 'jump' });
  assert.equal(sampleReplay(path, 9), path[1]);
  assert.equal(sampleReplay([], 1), null);
  path[1].x = 100;
  assert.equal(sampleReplay(path, 0.5).x, 0);
});

test('cinematic security positions interpolate recorded enemies and keep security state authentic', () => {
  const path = [
    { t: 0, x: 0, y: 0, security: { alarm: 7, enemies: [{ id: 'drone', x: 2, y: 3, state: 'chase' }], projectiles: [] } },
    { t: 1, x: 2, y: 0, security: { alarm: 14, enemies: [{ id: 'drone', x: 4, y: 5, state: 'patrol' }], projectiles: [] } },
  ];
  const frame = sampleReplay(path, 0.5);
  assert.deepEqual(frame.security.enemies[0], { id: 'drone', x: 3, y: 4, state: 'chase' });
  assert.equal(frame.security.alarm, 7);
  assert.equal(path[0].security.enemies[0].x, 2);
});

test('local runs preserve best and last separately and cap courses at five', (t) => {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } });
  t.after(() => delete globalThis.localStorage);
  const run = { time: 10, score: 100, frames, events: [], wallet: 'DEMO', artifacts: [] };
  assert.equal(saveRun('course-a', run).isBest, true);
  assert.equal(saveRun('course-a', { ...run, time: 11 }).isBest, false);
  assert.equal(getBestRun('course-a').time, 10);
  assert.equal(getLastRun('course-a').time, 11);
  assert.equal(saveRun('course-a', { ...run, time: 10.5 }).previousBest.time, 10);
  for (let i = 0; i < 6; i++) saveRun(`other-${i}`, run);
  assert.equal(getBestRuns().length, 5);
  assert.equal(getBestRun('course-a'), null);
  assert.throws(() => saveRun('broken', { ...run, frames: [{ t: 0, x: Infinity, y: 0 }] }), /invalid/);
});

test('storage unavailability does not prevent finishing or replaying the current run', (t) => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage disabled'); } });
  t.after(() => delete globalThis.localStorage);
  assert.equal(getBestRun('anything'), null);
  assert.equal(saveRun('demo', { time: 10, score: 100, frames }).saved, false);
});

test('challenge preserves exact sample course and compact real ghost movement', () => {
  const course = createDemoCourse();
  const challenge = buildChallengeUrl(course, { frames });
  assert.equal(challenge.includesGhost, true);
  assert.ok(challenge.url.length < 7500);
  const parsed = parseChallenge(challenge.url);
  assert.equal(parsed.wallet, 'DEMO');
  assert.deepEqual(parsed.signatures, course.signatures);
  assert.equal(parsed.seed, course.seed);
  assert.equal(parsed.ghost.time, frames.at(-1).t);
  assert.equal(parsed.ghost.frames.at(-1).x, frames.at(-1).x);
  assert.ok(parsed.ghost.frames.length < frames.length);
});

test('live challenge pins ordered signatures and skips ghosts that would exceed safe limits', () => {
  const course = { wallet: address(), signatures: [signature('2'), signature('3')] };
  const challenge = buildChallengeUrl(course, { frames: Array.from({ length: 1000 }, (_, i) => ({ t: i, x: i, y: 0 })) });
  assert.equal(challenge.includesGhost, false);
  assert.deepEqual(parseChallenge(challenge.url).signatures, course.signatures);
  assert.equal(parseChallenge('https://example.com/'), null);
});

test('malformed and conflicting challenge inputs are rejected', () => {
  const valid = buildChallengeUrl(createDemoCourse()).url;
  assert.throws(() => parseChallenge(valid.replace('v=1', 'v=2')), /version/);
  assert.throws(() => parseChallenge(`${valid}&wallet=DEMO`), /conflicting/);
  assert.throws(() => parseChallenge(`${valid}&ghost=not_a_valid_ghost`), /ghost/);
  assert.throws(() => parseChallenge(`${valid}&tx=${signature()}`), /sample/);
  assert.throws(() => parseChallenge(valid.replace(/seed=[a-f0-9]+/, 'seed=ffffffff')), /inconsistent/);
  assert.throws(() => parseChallenge(`${valid}&ghost=${'a'.repeat(8000)}`), /large/);
});
