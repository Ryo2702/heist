import { isValidAddress } from './solana.js';

export async function connectBrowserWallet(browser = window) {
  const provider = browser.phantom?.solana || browser.solflare || browser.solana;
  if (typeof provider?.connect !== 'function') throw new Error('No Solana wallet extension found. Install Phantom, then reload this page, or paste a public address.');
  const response = await provider.connect();
  const address = (response?.publicKey || provider.publicKey)?.toString();
  if (!isValidAddress(address)) throw new Error('The wallet did not return a valid Solana address.');
  return address;
}
