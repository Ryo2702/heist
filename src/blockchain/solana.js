export const COURSE_VERSION = '1';
export const TRANSACTION_LIMIT = 12;
export const HIGH_FEE_LAMPORTS = 100_000;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const RPC_URL = import.meta.env?.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const cache = new Map();

function isBase58Bytes(value, bytes) {
  if (typeof value !== 'string' || value.length < bytes || value.length > Math.ceil(bytes * 1.37)) return false;
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let length = value.match(/^1*/)[0].length;
  while (number > 0n) { length++; number >>= 8n; }
  return length === bytes;
}

export const isValidAddress = (address) => isBase58Bytes(address, 32);
export const isValidSignature = (signature) => isBase58Bytes(signature, 64);

export function createCourseSeed(wallet, signatures) {
  const text = `${wallet}|${COURSE_VERSION}|standard|${signatures.join(',')}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function rpcError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function rpc(method, params, signal) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (response.status === 429) throw rpcError('Solana RPC is rate limiting requests. Wait a moment and retry.', 'RATE_LIMIT');
    if (!response.ok) throw rpcError(`Solana RPC is temporarily unavailable (HTTP ${response.status}). Please try again shortly.`, 'UNAVAILABLE');
    const payload = await response.json();
    if (payload.error) {
      if (payload.error.code === -32015) throw rpcError('This transaction version is not supported by this game yet.', 'UNSUPPORTED_VERSION');
      if (payload.error.code === 429 || /rate|too many/i.test(payload.error.message || '')) throw rpcError('Solana RPC is rate limiting requests. Wait a moment and retry.', 'RATE_LIMIT');
      throw rpcError('The Solana RPC service could not read this history. Please try again shortly.', 'RPC_ERROR');
    }
    if (!Object.hasOwn(payload, 'result')) throw rpcError('The RPC service returned an invalid response.', 'INVALID_RESPONSE');
    return payload.result;
  } catch (error) {
    if (signal?.aborted) throw signal.reason || new DOMException('Request cancelled', 'AbortError');
    if (timedOut) throw rpcError('Solana RPC timed out. Please try again shortly.', 'TIMEOUT');
    if (error.code) throw error;
    throw rpcError('Could not reach Solana RPC. Check your connection and retry.', 'NETWORK');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const publicKey = (key) => typeof key === 'string' ? key : key?.pubkey;

function tokenChanges(meta, wallet) {
  if (!Array.isArray(meta?.preTokenBalances) || !Array.isArray(meta?.postTokenBalances)) return [];
  const accounts = new Map();
  for (const [side, balances] of [['pre', meta.preTokenBalances], ['post', meta.postTokenBalances]]) {
    for (const balance of balances) {
      if (!isValidAddress(balance.mint) || !Number.isInteger(balance.accountIndex)) continue;
      const key = `${balance.accountIndex}:${balance.mint}`;
      const entry = accounts.get(key) || {};
      entry[side] = balance;
      accounts.set(key, entry);
    }
  }
  const totals = new Map();
  for (const { pre, post } of accounts.values()) {
    if (pre?.owner !== wallet && post?.owner !== wallet) continue;
    if ((pre && !pre.owner) || (post && !post.owner)) continue;
    const balance = post || pre;
    const decimals = balance.uiTokenAmount?.decimals;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue;
    if ([pre, post].some((row) => row && (row.uiTokenAmount?.decimals !== decimals || !/^\d{1,20}$/.test(row.uiTokenAmount?.amount)))) continue;
    const before = pre?.owner === wallet ? BigInt(pre.uiTokenAmount.amount) : 0n;
    const after = post?.owner === wallet ? BigInt(post.uiTokenAmount.amount) : 0n;
    const key = `${balance.mint}:${decimals}`;
    const total = totals.get(key) || { mint: balance.mint, decimals, amount: 0n };
    total.amount += after - before;
    totals.set(key, total);
  }
  return [...totals.values()].filter((row) => row.amount !== 0n).map(({ mint, decimals, amount }) => {
    const digits = (amount < 0n ? -amount : amount).toString().padStart(decimals + 1, '0');
    const value = decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
    return { mint, decimals, rawChange: amount.toString(), change: `${amount < 0n ? '-' : ''}${value}` };
  });
}

export function transactionToArtifact(transaction, signatureInfo, wallet) {
  const signature = signatureInfo.signature;
  const meta = transaction?.meta;
  const keys = transaction?.transaction?.message?.accountKeys || [];
  const index = keys.findIndex((key) => publicKey(key) === wallet);
  const before = safeInteger(meta?.preBalances?.[index]);
  const after = safeInteger(meta?.postBalances?.[index]);
  const lamportChange = before !== null && after !== null && Number.isSafeInteger(after - before) ? after - before : null;
  const feeLamports = safeInteger(meta?.fee);
  const changes = tokenChanges(meta, wallet);
  const instructions = [
    ...(transaction?.transaction?.message?.instructions || []),
    ...(meta?.innerInstructions || []).flatMap((inner) => inner.instructions || []),
  ];
  const programs = [...new Set(instructions.map((instruction) => instruction.programId).filter(isValidAddress))];
  const transfers = instructions.filter((instruction) =>
    instruction.programId === '11111111111111111111111111111111' &&
    ['transfer', 'transferWithSeed'].includes(instruction.parsed?.type) &&
    [instruction.parsed.info?.source, instruction.parsed.info?.destination].includes(wallet) &&
    safeInteger(instruction.parsed.info?.lamports) !== null,
  );
  const statusInfo = meta && Object.hasOwn(meta, 'err') ? meta : signatureInfo;
  const status = Object.hasOwn(statusInfo, 'err') ? (statusInfo.err === null ? 'success' : 'failed') : 'unknown';
  const tokenInstruction = instructions.some((instruction) =>
    ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'].includes(instruction.programId) && instruction.parsed?.type,
  );
  let type = 'unknown';
  let label = 'UNCLASSIFIED TRANSACTION';
  if (status === 'failed') { type = 'failed'; label = 'FAILED TRANSACTION'; }
  else if (feeLamports !== null && feeLamports >= HIGH_FEE_LAMPORTS) { type = 'high-fee'; label = 'HIGH-FEE RELIC'; }
  else if (transfers.length) { type = 'sol'; label = 'SOL TRANSFER'; }
  else if (changes.length || tokenInstruction) { type = 'token'; label = 'TOKEN ACTIVITY'; }
  return {
    id: signature, signature, slot: safeInteger(transaction?.slot) ?? safeInteger(signatureInfo.slot),
    timestamp: safeInteger(transaction?.blockTime) ?? safeInteger(signatureInfo.blockTime),
    status, feeLamports, solChange: lamportChange === null ? null : lamportChange / 1e9,
    lamportChange, tokenChanges: changes, programs, type, label, sample: false,
    detailsAvailable: Boolean(transaction?.meta),
    transfers: transfers.map(({ parsed }) => ({ source: parsed.info.source, destination: parsed.info.destination, lamports: parsed.info.lamports })),
    rule: type === 'high-fee' ? `Game rarity rule: fee ≥ ${HIGH_FEE_LAMPORTS.toLocaleString('en-US')} lamports.` : null,
  };
}

export async function fetchWalletArtifacts(address, { signal, onProgress, before, signatures: pinned } = {}) {
  if (!isValidAddress(address)) throw rpcError('Enter a valid public Solana address (32 decoded bytes).', 'INVALID_ADDRESS');
  if (before && !isValidSignature(before)) throw rpcError('Invalid transaction window.', 'INVALID_WINDOW');
  if (pinned && (!Array.isArray(pinned) || !pinned.length || pinned.length > TRANSACTION_LIMIT || !pinned.every(isValidSignature) || new Set(pinned).size !== pinned.length)) {
    throw rpcError('This challenge has an invalid transaction window.', 'INVALID_WINDOW');
  }
  signal?.throwIfAborted();
  const cacheKey = `${address}|${before || ''}|${pinned?.join(',') || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 300_000) { onProgress?.(1); return structuredClone(cached.course); }
  onProgress?.(0.05);
  const rows = pinned ? pinned.map((signature) => ({ signature })) : await rpc('getSignaturesForAddress', [address, {
    commitment: 'confirmed', limit: TRANSACTION_LIMIT, ...(before ? { before } : {}),
  }], signal);
  if (!Array.isArray(rows) || rows.length > TRANSACTION_LIMIT || rows.some((row) => !isValidSignature(row?.signature))) throw rpcError('The RPC returned malformed transaction signatures.', 'INVALID_RESPONSE');
  if (!rows.length) throw rpcError('No confirmed transactions were found for this address. Try another public wallet.', 'EMPTY_HISTORY');
  if (new Set(rows.map((row) => row.signature)).size !== rows.length) throw rpcError('The RPC returned duplicate transactions.', 'INVALID_RESPONSE');
  const artifacts = new Array(rows.length);
  const warnings = [];
  let next = 0;
  let completed = 0;
  let fatalError = null;
  async function worker() {
    while (next < rows.length && !fatalError) {
      const i = next++;
      const row = rows[i];
      try {
        const transaction = await rpc('getTransaction', [row.signature, { commitment: 'confirmed', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }], signal);
        if (transaction && (!transaction.transaction?.signatures?.includes(row.signature) || !transaction.transaction?.message?.accountKeys?.some((key) => publicKey(key) === address))) {
          throw rpcError('A transaction did not match this wallet and signature.', 'INVALID_RESPONSE');
        }
        if (pinned && !transaction?.meta) throw rpcError('A transaction in this challenge is unavailable. Retry later to preserve the exact course.', 'MISSING_DETAILS');
        if (!transaction?.meta) warnings.push('Some transaction details are unavailable. Those artifacts show verified signature metadata only.');
        artifacts[i] = transactionToArtifact(transaction, row, address);
      } catch (error) {
        if (signal?.aborted || pinned || ['RATE_LIMIT', 'NETWORK', 'TIMEOUT', 'UNAVAILABLE', 'INVALID_RESPONSE'].includes(error.code)) {
          fatalError = error;
          return;
        }
        warnings.push(error.message);
        artifacts[i] = transactionToArtifact(null, row, address);
      }
      completed++;
      onProgress?.(0.1 + 0.85 * completed / rows.length);
    }
  }
  await Promise.all([worker(), worker()]);
  if (fatalError) throw fatalError;
  signal?.throwIfAborted();
  const signatures = rows.map((row) => row.signature);
  const oldest = artifacts.reduce((best, artifact) => artifact.slot !== null && (best === null || artifact.slot < best.slot) ? artifact : best, null);
  if (oldest) oldest.windowHighlight = 'Earliest activity in this selected transaction window; not necessarily the wallet’s first transaction.';
  const course = {
    wallet: address, artifacts, signatures, seed: createCourseSeed(address, signatures), source: 'live',
    warnings: [...new Set(warnings)], version: COURSE_VERSION,
    window: { limit: TRANSACTION_LIMIT, before: before || null, signatures },
  };
  if (cache.size >= 5) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: Date.now(), course });
  onProgress?.(1);
  return structuredClone(course);
}
