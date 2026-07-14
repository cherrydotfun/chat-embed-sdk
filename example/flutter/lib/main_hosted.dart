/// main_hosted.dart — EXAMPLE 1: host page hosted on your web server.
///
/// The WebView loads `https://yoursite.com/cherry-host.html` (deploy the shared
/// `host.html`). Flutter owns config and native wallet signing.
///
/// Shown in `app-trusted+wallet` (backend token + wallet signature) — the mode
/// where `signChallenge` matters. For `wallet-only`, drop `token` and the
/// `/api/embed-token` fetch; everything else is identical.
///
/// Run:  flutter run -t lib/main_hosted.dart

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import 'package:http/http.dart' as http;

import 'cherry_chat_webview.dart';
import 'wallet.dart';

const _hostUrl = 'https://yoursite.com/cherry-host.html';
const _appId = 'your-app-id';
const _roomId = 'your-public-room-id';

// app-trusted+wallet only: your backend mints a short-lived HS256 embed token
// bound to the wallet address (derive it from your session in production).
Future<String> _fetchEmbedToken(String walletAddress) async {
  final res = await http.post(
    Uri.parse('https://yoursite.com/api/embed-token'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'walletAddress': walletAddress}),
  );
  if (res.statusCode != 200) throw Exception('Failed to fetch embed token');
  return (jsonDecode(res.body) as Map<String, dynamic>)['embedToken'] as String;
}

void main() => runApp(const MaterialApp(home: HostedChatPage()));

class HostedChatPage extends StatefulWidget {
  const HostedChatPage({super.key});
  @override
  State<HostedChatPage> createState() => _HostedChatPageState();
}

class _HostedChatPageState extends State<HostedChatPage> {
  final _appLinks = AppLinks();
  CherryChatConfig _config = const CherryChatConfig(appId: _appId, roomId: _roomId);
  String _status = 'preview';

  @override
  void initState() {
    super.initState();
    // iOS Phantom deeplink returns here.
    _appLinks.uriLinkStream.listen(handleWalletDeeplink);
  }

  Future<void> _connect() async {
    try {
      final address = await connectWallet();
      final token = await _fetchEmbedToken(address);
      // Updating config re-sends it to the host page (see CherryChatWebView).
      setState(() => _config = CherryChatConfig(
            appId: _appId,
            roomId: _roomId,
            walletAddress: address,
            token: token,
          ));
    } catch (e) {
      debugPrint('connect failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D11),
      appBar: AppBar(
        backgroundColor: const Color(0xFF16161E),
        title: Row(children: [
          const Text('Cherry Chat'),
          const SizedBox(width: 10),
          Text(_status, style: const TextStyle(fontSize: 12, color: Color(0xFF6B6B80))),
        ]),
        actions: [
          if (_config.walletAddress == null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton(onPressed: _connect, child: const Text('Connect Wallet')),
            ),
        ],
      ),
      body: CherryChatWebView(
        source: CherryChatSource.url(_hostUrl),
        config: _config,
        onSign: signMessageWithWallet, // native MWA (Android) / Phantom (iOS)
        onWalletConnectRequested: _connect,
        onEvent: (event, data) {
          if (event == 'authStateChange') {
            setState(() => _status = data == true ? 'authenticated' : 'signed-out');
          } else if (event == 'preview') {
            setState(() => _status = 'preview');
          } else if (event == 'error') {
            debugPrint('cherry error: $data');
          }
        },
      ),
    );
  }
}
