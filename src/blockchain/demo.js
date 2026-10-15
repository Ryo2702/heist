import { COURSE_VERSION, createCourseSeed } from './solana.js';

export const DEMO_WALLET = 'DEMO';
const TYPES = [
  ['sol', 'SOL CRYSTAL'], ['token', 'TOKEN CAPSULE'], ['sol', 'TRANSFER PRISM'],
  ['failed', 'FRACTURED BLOCK'], ['token', 'TOKEN ECHO'], ['high-fee', 'PRIORITY RELIC'],
  ['sol', 'NEON CRYSTAL'], ['unknown', 'UNKNOWN SIGNAL'], ['token', 'TOKEN CORE'],
  ['high-fee', 'VAULT RELIC'], ['sol', 'GENESIS PRISM'], ['early', 'ARCHIVE KEY'],
];

export const DEMO_ARTIFACTS = TYPES.map(([type, label], i) => ({
  id: `demo-artifact-${i + 1}`, signature: `SAMPLE-TRANSACTION-${String(i + 1).padStart(2, '0')}`,
  slot: 250_000_000 - i * 345, timestamp: 1_720_000_000 - i * 3600,
  status: type === 'failed' ? 'failed' : 'success', feeLamports: type === 'high-fee' ? 125_000 : 5000,
  solChange: type === 'sol' ? (i + 1) * 0.25 : null, tokenChanges: [], type, label,
  sample: true, detailsAvailable: true, programs: [],
  description: 'Fictional sample transaction for the built-in course. This is game loot, not a blockchain asset.',
  rule: type === 'high-fee' ? 'Sample rarity rule: sample fee ≥ 100,000 lamports.' : null,
}));

export function createDemoCourse() {
  const artifacts = structuredClone(DEMO_ARTIFACTS);
  const signatures = artifacts.map((artifact) => artifact.signature);
  return {
    wallet: DEMO_WALLET, artifacts, signatures, seed: createCourseSeed(DEMO_WALLET, signatures),
    source: 'demo', warnings: [], version: COURSE_VERSION, window: { signatures },
  };
}
