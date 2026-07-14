/**
 * wallet.ts — native mobile wallet signing for the Cherry Chat embed.
 *
 * The Cherry embed's `signChallenge` step needs a raw Ed25519 signature over
 * challenge bytes the server generates. On mobile there is no `window.phantom`
 * inside the WebView — the wallet lives in the NATIVE layer:
 *
 *   - Android → Mobile Wallet Adapter (MWA): `@solana-mobile/mobile-wallet-adapter-protocol`
 *   - iOS     → deeplink to Phantom / Solflare / Backpack (no MWA on iOS yet)
 *
 * These are STUBS. Wire them to whatever wallet stack your app already uses
 * (e.g. `@solana-mobile/mobile-wallet-adapter-protocol-web3js`, or your own
 * deeplink handler). Both functions must deal in `Uint8Array` — the
 * CherryChatWebView bridge handles base64 on the wire for you.
 *
 * Contract:
 *   - `connectWallet()`  → resolves the connected wallet's base58 address.
 *   - `signMessageWithWallet(bytes)` → resolves the 64-byte Ed25519 signature
 *     over EXACTLY those bytes (do not re-hash, do not prefix).
 */

import { Platform } from 'react-native';

/**
 * Connect the user's wallet and return its base58 public key.
 *
 * app-trusted+wallet: you also need this address server-side to mint the
 * embed token (bind `sub` to it). wallet-only: you just forward it to the
 * embed via `setWalletAddress`.
 */
export async function connectWallet(): Promise<string> {
  if (Platform.OS === 'android') {
    // ── Android — Mobile Wallet Adapter ──────────────────────────────────
    // import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
    //
    // return transact(async (wallet) => {
    //   const auth = await wallet.authorize({
    //     cluster: 'solana:mainnet',
    //     identity: { name: 'My App', uri: 'https://yoursite.com', icon: 'favicon.ico' },
    //   });
    //   const addressBytes = toByteArray(auth.accounts[0].address); // base64 → bytes
    //   return new PublicKey(addressBytes).toBase58();
    // });
    throw new Error('connectWallet: wire up Mobile Wallet Adapter (see wallet.ts)');
  }

  // ── iOS — deeplink wallet (Phantom / Solflare / Backpack) ──────────────
  // Use the wallet's connect deeplink, capture the returned public key from
  // your universal-link handler, and resolve it here. See:
  // https://docs.phantom.com/phantom-deeplinks/provider-methods/connect
  throw new Error('connectWallet: wire up an iOS deeplink wallet flow (see wallet.ts)');
}

/**
 * Sign the challenge bytes with the user's wallet and return the raw
 * 64-byte Ed25519 signature.
 *
 * IMPORTANT: sign the bytes AS-IS. The Cherry server verifies
 * `ed25519.verify(signature, challengeBytes, walletPublicKey)`.
 */
export async function signMessageWithWallet(message: Uint8Array): Promise<Uint8Array> {
  if (Platform.OS === 'android') {
    // ── Android — Mobile Wallet Adapter ──────────────────────────────────
    // import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
    //
    // return transact(async (wallet) => {
    //   await wallet.reauthorize({ auth_token: storedAuthToken, identity: { ... } });
    //   const signed = await wallet.signMessages({
    //     addresses: [storedBase64Address],
    //     payloads: [message],
    //   });
    //   // signMessages returns the message with the 64-byte signature appended;
    //   // some wallets return the signature only. Slice the last 64 bytes to be safe:
    //   const out = signed[0];
    //   return out.length > 64 ? out.slice(out.length - 64) : out;
    // });
    throw new Error('signMessageWithWallet: wire up MWA signMessages (see wallet.ts)');
  }

  // ── iOS — deeplink signMessage ─────────────────────────────────────────
  // Phantom deeplink `signMessage` returns a base58 signature — decode it to
  // bytes before returning. See:
  // https://docs.phantom.com/phantom-deeplinks/provider-methods/signmessage
  throw new Error('signMessageWithWallet: wire up an iOS deeplink signMessage (see wallet.ts)');
}
