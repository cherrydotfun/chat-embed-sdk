/// main_bundled.dart — EXAMPLE 2: host page bundled inside the Flutter app.
///
/// No separate web page to deploy. The host page is built from
/// `buildCherryHostHtml()` and loaded via `controller.loadHtmlString(...)`.
///
/// The SDK bundle is still fetched from a URL (`sdkUrl`, default the
/// Cherry-hosted rolling bundle). `CherryChatSource.html` passes a `baseUrl` so
/// iOS/WKWebView allows the remote SDK `<script src>`.
///
/// Shown in `wallet-only` flavor (no backend, no token). For app-trusted+wallet
/// add `token` to the config exactly like main_hosted.dart.
///
/// Run:  flutter run -t lib/main_bundled.dart

import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';

import 'cherry_chat_webview.dart';
import 'cherry_host_html.dart';
import 'wallet.dart';

const _appId = 'your-app-id';
const _roomId = 'your-public-room-id';
// URL where the built SDK bundle is hosted (default: Cherry rolling bundle).
const _sdkUrl = 'https://embed.cherry.fun/cherry-embed.js';

void main() => runApp(const MaterialApp(home: BundledChatPage()));

class BundledChatPage extends StatefulWidget {
  const BundledChatPage({super.key});
  @override
  State<BundledChatPage> createState() => _BundledChatPageState();
}

class _BundledChatPageState extends State<BundledChatPage> {
  final _appLinks = AppLinks();
  // Build the host HTML once — it carries no per-user data; config is sent over
  // the bridge after the page reports 'ready'.
  late final String _html = buildCherryHostHtml(sdkUrl: _sdkUrl);
  CherryChatConfig _config = const CherryChatConfig(appId: _appId, roomId: _roomId);
  String _status = 'preview';

  @override
  void initState() {
    super.initState();
    _appLinks.uriLinkStream.listen(handleWalletDeeplink); // iOS Phantom return
  }

  Future<void> _connect() async {
    try {
      final address = await connectWallet();
      setState(() => _config = CherryChatConfig(
            appId: _appId,
            roomId: _roomId,
            walletAddress: address,
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
        // baseUrl gives the html doc an origin so iOS loads the remote SDK script.
        source: CherryChatSource.html(_html, baseUrl: 'https://embed.cherry.fun'),
        config: _config,
        onSign: signMessageWithWallet,
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
