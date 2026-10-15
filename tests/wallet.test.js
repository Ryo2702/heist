import test from 'node:test';
import assert from 'node:assert/strict';
import { connectBrowserWallet } from '../src/blockchain/wallet.js';

const address = '11111111111111111111111111111111';

test('connects an extension and returns only its validated public address', async () => {
  let calls = 0;
  const provider = { connect: async () => { calls++; return { publicKey: { toString: () => address } }; } };
  assert.equal(await connectBrowserWallet({ phantom: { solana: provider } }), address);
  assert.equal(calls, 1);
  assert.equal(await connectBrowserWallet({ solana: provider }), address);
  assert.equal(await connectBrowserWallet({ solflare: { connect: async () => {}, publicKey: address } }), address);
});

test('handles missing extensions, invalid addresses and cancelled approval', async () => {
  await assert.rejects(connectBrowserWallet({}), /No Solana wallet extension/);
  await assert.rejects(connectBrowserWallet({ solana: { connect: async () => ({ publicKey: 'bad' }) } }), /valid Solana address/);
  await assert.rejects(connectBrowserWallet({ solana: { connect: async () => ({}) } }), /valid Solana address/);
  const cancellation = Object.assign(new Error('Cancelled'), { code: 4001 });
  await assert.rejects(connectBrowserWallet({ solana: { connect: async () => { throw cancellation; } } }), cancellation);
});
