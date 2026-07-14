/**
 * App.hosted.tsx — EXAMPLE 1: host page hosted on your web server.
 *
 * The WebView loads `https://yoursite.com/cherry-host.html` (the deployed
 * `host.html`). React Native owns the config and the native wallet signing.
 *
 * This example shows `app-trusted+wallet` (backend token + wallet signature) —
 * the mode where `signChallenge` matters. For `wallet-only`, drop the `token`
 * and the `/api/embed-token` fetch; everything else is identical.
 */

import React, { useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, Pressable } from 'react-native';
import {
  CherryChatWebView,
  type CherryChatWebViewRef,
} from './CherryChatWebView';
import { connectWallet, signMessageWithWallet } from './wallet';

// Deploy host.html + cherry-embed.js here (see host.html header comment).
const HOST_URL = 'https://yoursite.com/cherry-host.html';
const APP_ID = 'your-app-id';
const ROOM_ID = 'your-public-room-id';

// app-trusted+wallet only: your backend mints a short-lived HS256 embed token
// bound to the wallet address. Derive the address from your session in prod.
async function fetchEmbedToken(walletAddress: string): Promise<string> {
  const res = await fetch('https://yoursite.com/api/embed-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) throw new Error('Failed to fetch embed token');
  const { embedToken } = await res.json();
  return embedToken;
}

export default function App() {
  const chatRef = useRef<CherryChatWebViewRef>(null);
  const [walletAddress, setWalletAddress] = useState<string | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [status, setStatus] = useState('preview');

  // Called when the user taps send/react in read-only preview with no wallet.
  const onConnect = async () => {
    try {
      const address = await connectWallet();
      const embedToken = await fetchEmbedToken(address);
      // Updating props re-sends config to the host page (see CherryChatWebView).
      setWalletAddress(address);
      setToken(embedToken);
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
        source={{ uri: HOST_URL }}
        config={{
          appId: APP_ID,
          roomId: ROOM_ID,
          walletAddress,
          token,
          // embedUrl: 'https://embed.cherry.fun', // default; override for stage/local
        }}
        // Signing happens natively — MWA (Android) / deeplink (iOS).
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
