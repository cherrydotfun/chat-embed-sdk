/**
 * App.bundled.tsx — EXAMPLE 2: host page bundled inside the RN repo.
 *
 * No separate web page to deploy. The host page is built from
 * `cherryHostHtml.ts` and passed to the WebView as `source={{ html }}`.
 *
 * You still host the built SDK bundle (dist/index.global.js) at a URL the
 * device can reach — pass it as `sdkUrl`. See cherryHostHtml.ts for the
 * fully-offline (inlined SDK) variant.
 *
 * Shown in `wallet-only` flavor (no backend, no token). For app-trusted+wallet,
 * add `token` to the config exactly like App.hosted.tsx.
 */

import React, { useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, Pressable } from 'react-native';
import {
  CherryChatWebView,
  type CherryChatWebViewRef,
} from './CherryChatWebView';
import { buildCherryHostHtml } from './cherryHostHtml';
import { connectWallet, signMessageWithWallet } from './wallet';

const APP_ID = 'your-app-id';
const ROOM_ID = 'your-public-room-id';
// Cherry-hosted SDK bundle (same origin as the chat iframe). Rolling URL —
// tracks the latest embed deploy. Pin a hashed copy yourself if you need a
// frozen version. Self-hosting? Point this at your own cherry-embed.js.
const SDK_URL = 'https://embed.cherry.fun/cherry-embed.js';

export default function App() {
  const chatRef = useRef<CherryChatWebViewRef>(null);
  const [walletAddress, setWalletAddress] = useState<string | undefined>();
  const [status, setStatus] = useState('preview');

  // Build the host HTML once. It carries no per-user data — config is sent
  // over the bridge after the page reports 'ready'.
  const html = useMemo(() => buildCherryHostHtml({ sdkUrl: SDK_URL }), []);

  const onConnect = async () => {
    try {
      const address = await connectWallet();
      setWalletAddress(address); // re-sends config → iframe starts signChallenge
    } catch (err) {
      console.warn('connect failed', err);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Text style={styles.title}>Cherry Chat</Text>
        <Text style={styles.status}>{status}</Text>
        {!walletAddress && (
          <Pressable style={styles.btn} onPress={onConnect}>
            <Text style={styles.btnText}>Connect Wallet</Text>
          </Pressable>
        )}
      </View>

      <CherryChatWebView
        ref={chatRef}
        source={{ html }}
        config={{
          appId: APP_ID,
          roomId: ROOM_ID,
          walletAddress,
        }}
        onSign={signMessageWithWallet}
        onWalletConnectRequested={onConnect}
        onEvent={(event, data) => {
          if (event === 'authStateChange') setStatus(data ? 'authenticated' : 'signed-out');
          if (event === 'preview') setStatus('preview');
          if (event === 'error') console.warn('cherry error', data);
        }}
        style={styles.chat}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d11' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { color: '#e8e8f0', fontSize: 16, fontWeight: '700' },
  status: { color: '#6b6b80', fontSize: 12, flex: 1 },
  btn: { backgroundColor: '#ab9ff2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: '#1a1a2e', fontWeight: '600', fontSize: 13 },
  chat: { flex: 1, backgroundColor: 'transparent' },
});
