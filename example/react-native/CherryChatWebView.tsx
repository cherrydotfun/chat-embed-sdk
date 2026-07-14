/**
 * CherryChatWebView — React Native wrapper for the Cherry Chat embed.
 *
 * WHY THIS EXISTS
 * ---------------
 * `@cherrydotfun/chat-embed-sdk` (`CherryEmbed`) is a **browser-only** SDK: it
 * calls `document.createElement('iframe')`, listens on `window` `message`
 * events, and posts to `iframe.contentWindow`. None of that exists in the React
 * Native JS runtime, so `CherryEmbed` cannot run directly in RN.
 *
 * Instead we run the SDK inside a `react-native-webview`, on a tiny **host
 * page** (see `host.html` / `cherryHostHtml.ts`). The embed chat itself is a
 * nested iframe that the SDK creates on that host page — the SDK REQUIRES a
 * parent frame (its `signChallenge` bridge rejects when `window.parent ===
 * window`), which is exactly why you must NOT point the WebView straight at
 * `embed.cherry.fun`.
 *
 * The one thing the host page cannot do on mobile is sign the challenge:
 * there is no `window.phantom` in a mobile WebView. So `signChallengeHandler`
 * on the host page forwards the challenge bytes out to THIS native component
 * (via `window.ReactNativeWebView.postMessage`), we sign with the real mobile
 * wallet (Mobile Wallet Adapter on Android / deeplink on iOS — see `wallet.ts`),
 * and inject the signature back in.
 *
 *   RN (native wallet: MWA / deeplink)
 *      |  injectJavaScript  ↑↓  onMessage
 *      v
 *   WebView → host page (runs CherryEmbed SDK, creates iframe)
 *      v
 *   iframe → embed.cherry.fun (the chat)
 *
 * This component is delivery-agnostic: pass `source={{ uri }}` to load a hosted
 * host page (Example 1) or `source={{ html }}` to load one bundled in your repo
 * (Example 2). Everything else is identical.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';

/** WebView source: a hosted URL (Example 1) or an inline HTML string (Example 2). */
type WebViewSource = { uri: string } | { html: string; baseUrl?: string };

/** Config forwarded to the host page and passed straight into `CherryEmbed`. */
export interface CherryChatConfig {
  /** Public embed app id (from the Cherry Admin Panel). */
  appId: string;
  /** Public room to open. Omit to show the room list (mode dependent). */
  roomId?: string;
  /** Cherry embed iframe origin. Defaults to https://embed.cherry.fun. */
  embedUrl?: string;
  /** Embed display mode. Defaults to 'single'. */
  mode?: 'single' | 'external-controlled' | 'list';
  /** app-trusted / app-trusted+wallet: short-lived HS256 embed token. */
  token?: string;
  /** Wallet address to show before the signChallenge exchange completes. */
  walletAddress?: string;
  /** Theme overrides (see EmbedTheme in the SDK types). */
  theme?: Record<string, unknown>;
  /** Layout overrides (see EmbedLayout in the SDK types). */
  layout?: Record<string, unknown>;
}

export interface CherryChatWebViewProps {
  /** `{ uri }` for a hosted host page, or `{ html }` for a bundled one. */
  source: WebViewSource;
  config: CherryChatConfig;
  /**
   * Sign the challenge with the user's mobile wallet. Receives the raw
   * challenge bytes and must resolve to the 64-byte Ed25519 signature.
   * This runs in the NATIVE layer — wire it to Mobile Wallet Adapter (Android)
   * or a deeplink wallet (iOS). See `wallet.ts`.
   */
  onSign: (message: Uint8Array) => Promise<Uint8Array>;
  /**
   * Forwarded SDK events: 'ready' | 'mounted' | 'authStateChange' |
   * 'unreadCount' | 'message' | 'tokenExpired' | 'error' |
   * 'walletConnectRequested' | 'preview' | 'roomChanged'.
   */
  onEvent?: (event: string, data: unknown) => void;
  /**
   * Convenience callback for the 'walletConnectRequested' event — fired when
   * the user taps send/react in read-only preview and no wallet is connected
   * yet. Typically: connect the wallet, then call `setWalletAddress()` (and
   * `setToken()` for app-trusted+wallet) on the ref.
   */
  onWalletConnectRequested?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Passed through to the underlying WebView. */
  webViewProps?: Partial<React.ComponentProps<typeof WebView>>;
}

/** Imperative commands you can call on the mounted chat from native code. */
export interface CherryChatWebViewRef {
  setWalletAddress: (address: string) => void;
  setToken: (token: string) => void;
  setRoom: (roomId: string) => void;
  setTheme: (theme: Record<string, unknown>) => void;
  signOut: () => void;
  show: () => void;
  hide: () => void;
}

// ── base64 <-> bytes (pure JS; Hermes has no reliable atob/btoa on older RN) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const lookup = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e0 = lookup[clean.charCodeAt(i)]!;
    const e1 = lookup[clean.charCodeAt(i + 1)]!;
    const e2 = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const e3 = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)]! : 0;
    out[p++] = (e0 << 2) | (e1 >> 4);
    if (i + 2 < clean.length && lookup[clean.charCodeAt(i + 2)] !== 255) out[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (i + 3 < clean.length && lookup[clean.charCodeAt(i + 3)] !== 255) out[p++] = ((e2 & 3) << 6) | e3;
  }
  return out.slice(0, p);
}

/** Messages the host page sends up to native (`ReactNativeWebView.postMessage`). */
type HostMessage =
  | { type: 'ready' }
  | { type: 'sign'; id: string; message: string }
  | { type: 'event'; event: string; data?: unknown };

export const CherryChatWebView = forwardRef<CherryChatWebViewRef, CherryChatWebViewProps>(
  function CherryChatWebView(props, ref) {
    const { source, config, onSign, onEvent, onWalletConnectRequested, style, webViewProps } = props;
    const webRef = useRef<WebView>(null);
    const isReadyRef = useRef(false);

    // Keep the latest config/handlers in refs so the message handler is stable.
    const configRef = useRef(config);
    configRef.current = config;
    const onSignRef = useRef(onSign);
    onSignRef.current = onSign;

    const inject = useCallback((js: string) => {
      webRef.current?.injectJavaScript(`${js}; true;`);
    }, []);

    const sendConfig = useCallback(() => {
      const json = JSON.stringify(configRef.current);
      inject(`window.__cherryReceiveConfig(${JSON.stringify(json)})`);
    }, [inject]);

    const command = useCallback(
      (method: string, params?: Record<string, unknown>) => {
        inject(`window.__cherryCommand(${JSON.stringify(method)}, ${JSON.stringify(JSON.stringify(params ?? {}))})`);
      },
      [inject],
    );

    useImperativeHandle(
      ref,
      (): CherryChatWebViewRef => ({
        setWalletAddress: (address) => command('setWalletAddress', { walletAddress: address }),
        setToken: (token) => command('setToken', { token }),
        setRoom: (roomId) => command('setRoom', { roomId }),
        setTheme: (theme) => command('setTheme', { theme }),
        signOut: () => command('signOut'),
        show: () => command('show'),
        hide: () => command('hide'),
      }),
      [command],
    );

    // Re-send config when appId/room/token/wallet change AFTER the host is ready.
    useEffect(() => {
      if (isReadyRef.current) sendConfig();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.appId, config.roomId, config.token, config.walletAddress, sendConfig]);

    const handleMessage = useCallback(
      async (e: WebViewMessageEvent) => {
        let msg: HostMessage;
        try {
          msg = JSON.parse(e.nativeEvent.data) as HostMessage;
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          isReadyRef.current = true;
          sendConfig();
          return;
        }

        if (msg.type === 'sign') {
          const { id } = msg;
          try {
            const messageBytes = base64ToBytes(msg.message);
            const signature = await onSignRef.current(messageBytes);
            const sigB64 = bytesToBase64(signature);
            inject(`window.__cherrySignResult(${JSON.stringify(id)}, ${JSON.stringify(sigB64)}, null)`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            inject(`window.__cherrySignResult(${JSON.stringify(id)}, null, ${JSON.stringify(errorMsg)})`);
          }
          return;
        }

        if (msg.type === 'event') {
          if (msg.event === 'walletConnectRequested') onWalletConnectRequested?.();
          onEvent?.(msg.event, msg.data);
          return;
        }
      },
      [inject, onEvent, onWalletConnectRequested, sendConfig],
    );

    return (
      <WebView
        ref={webRef}
        source={source}
        onMessage={handleMessage}
        // The host page loads the SDK and the embed iframe over https.
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // Chat auth (Cherry JWT) lives in the iframe's sessionStorage; keep it.
        thirdPartyCookiesEnabled
        // Wallet deeplinks (iOS) navigate away and back — allow it.
        setSupportMultipleWindows={false}
        style={style}
        {...webViewProps}
      />
    );
  },
);
