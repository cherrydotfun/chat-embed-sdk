/// CherryChatWebView — Flutter wrapper for the Cherry Chat embed.
///
/// WHY THIS EXISTS
/// --------------
/// `@cherrydotfun/chat-embed-sdk` (`CherryEmbed`) is a browser-only SDK: it
/// builds an `<iframe>` via `document`, listens on `window` `message` events,
/// and posts to `iframe.contentWindow`. None of that exists in Dart, so the SDK
/// cannot run in Flutter directly.
///
/// Instead we run the SDK inside a `webview_flutter` WebView, on a tiny **host
/// page** (the same `host.html` / `cherryHostHtml.ts` used by the React Native
/// example — the page auto-detects the platform). The embed chat is a nested
/// iframe the SDK creates on that page; the SDK REQUIRES a parent frame (its
/// `signChallenge` bridge rejects when `window.parent === window`), so never
/// point the WebView straight at `embed.cherry.fun`.
///
/// The one thing the host page cannot do on mobile is sign the challenge (there
/// is no `window.phantom` in a mobile WebView). Its `signChallengeHandler`
/// forwards the challenge bytes out to this widget via a JavaScriptChannel; we
/// sign natively (Mobile Wallet Adapter on Android / Phantom deeplink on iOS —
/// see `wallet.dart`) and inject the signature back with `runJavaScript`.
///
///   Flutter (native wallet: MWA / deeplink)
///      |  runJavaScript  ↑↓  JavaScriptChannel("CherryNative")
///      v
///   WebView → host page (runs CherryEmbed SDK, creates the iframe)
///      v
///   iframe → embed.cherry.fun (the chat)
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// The JavaScriptChannel name the host page expects. Must be exactly this —
/// `host.html` / `cherryHostHtml.ts` call `window.CherryNative.postMessage(...)`.
const String kCherryChannel = 'CherryNative';

/// Config forwarded to the host page and passed straight into `CherryEmbed`.
class CherryChatConfig {
  const CherryChatConfig({
    required this.appId,
    this.roomId,
    this.embedUrl,
    this.mode,
    this.token,
    this.walletAddress,
    this.theme,
    this.layout,
  });

  /// Public embed app id (from the Cherry Admin Panel).
  final String appId;

  /// Public room to open. Omit to show the room list (mode dependent).
  final String? roomId;

  /// Cherry embed iframe origin. Defaults to https://embed.cherry.fun.
  final String? embedUrl;

  /// Embed display mode: 'single' | 'external-controlled' | 'list'.
  final String? mode;

  /// app-trusted / app-trusted+wallet: short-lived HS256 embed token.
  final String? token;

  /// Wallet address to show before the signChallenge exchange completes.
  final String? walletAddress;

  /// Theme overrides (see EmbedTheme in the SDK types).
  final Map<String, dynamic>? theme;

  /// Layout overrides (see EmbedLayout in the SDK types).
  final Map<String, dynamic>? layout;

  Map<String, dynamic> toJson() => {
        'appId': appId,
        if (roomId != null) 'roomId': roomId,
        if (embedUrl != null) 'embedUrl': embedUrl,
        if (mode != null) 'mode': mode,
        if (token != null) 'token': token,
        if (walletAddress != null) 'walletAddress': walletAddress,
        if (theme != null) 'theme': theme,
        if (layout != null) 'layout': layout,
      };

  /// Fields whose change should re-send config (and remount the chat).
  bool sameSession(CherryChatConfig other) =>
      appId == other.appId &&
      roomId == other.roomId &&
      token == other.token &&
      walletAddress == other.walletAddress;
}

/// Where the host page comes from: a hosted URL (Example 1) or an inline HTML
/// string bundled in your app (Example 2).
class CherryChatSource {
  const CherryChatSource._(this.url, this.html, this.baseUrl);

  /// Example 1 — host page hosted on your web server.
  factory CherryChatSource.url(String url) => CherryChatSource._(url, null, null);

  /// Example 2 — host page built in-app (see cherry_host_html.dart).
  /// `baseUrl` gives the document an origin so iOS/WKWebView allows the remote
  /// SDK `<script src>` — set it to the SDK's origin, e.g. https://embed.cherry.fun.
  factory CherryChatSource.html(String html, {String baseUrl = 'https://embed.cherry.fun'}) =>
      CherryChatSource._(null, html, baseUrl);

  final String? url;
  final String? html;
  final String? baseUrl;
}

/// Sign the challenge with the user's mobile wallet. Receives the raw challenge
/// bytes and must resolve to the 64-byte Ed25519 signature (bytes as-is — no
/// re-hash, no prefix). Wire it to `wallet.dart`.
typedef SignChallenge = Future<Uint8List> Function(Uint8List message);

/// Imperative commands you can send to the mounted chat.
class CherryChatController {
  WebViewController? _wv;

  void _attach(WebViewController wv) => _wv = wv;

  void setWalletAddress(String address) => _cmd('setWalletAddress', {'walletAddress': address});
  void setToken(String token) => _cmd('setToken', {'token': token});
  void setRoom(String roomId) => _cmd('setRoom', {'roomId': roomId});
  void setTheme(Map<String, dynamic> theme) => _cmd('setTheme', {'theme': theme});
  void signOut() => _cmd('signOut', const {});
  void show() => _cmd('show', const {});
  void hide() => _cmd('hide', const {});

  void _cmd(String method, Map<String, dynamic> params) {
    // jsonEncode twice: once for the params object, once to turn each argument
    // into a safe JS string literal for runJavaScript.
    _wv?.runJavaScript(
      'window.__cherryCommand(${jsonEncode(method)}, ${jsonEncode(jsonEncode(params))})',
    );
  }
}

class CherryChatWebView extends StatefulWidget {
  const CherryChatWebView({
    super.key,
    required this.source,
    required this.config,
    required this.onSign,
    this.controller,
    this.onEvent,
    this.onWalletConnectRequested,
  });

  final CherryChatSource source;
  final CherryChatConfig config;
  final SignChallenge onSign;

  /// Optional — call imperative methods (setWalletAddress, setToken, ...).
  final CherryChatController? controller;

  /// Forwarded SDK events: 'ready' | 'mounted' | 'authStateChange' |
  /// 'unreadCount' | 'message' | 'tokenExpired' | 'error' |
  /// 'walletConnectRequested' | 'preview' | 'roomChanged'.
  final void Function(String event, dynamic data)? onEvent;

  /// Convenience for the 'walletConnectRequested' event — fired when the user
  /// taps send/react in read-only preview with no wallet connected. Typically:
  /// connect the wallet, then update `config.walletAddress` (and `token`).
  final VoidCallback? onWalletConnectRequested;

  @override
  State<CherryChatWebView> createState() => _CherryChatWebViewState();
}

class _CherryChatWebViewState extends State<CherryChatWebView> {
  late final WebViewController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..addJavaScriptChannel(kCherryChannel, onMessageReceived: _onMessage);

    widget.controller?._attach(_controller);

    final src = widget.source;
    if (src.url != null) {
      _controller.loadRequest(Uri.parse(src.url!));
    } else {
      _controller.loadHtmlString(src.html!, baseUrl: src.baseUrl);
    }
  }

  @override
  void didUpdateWidget(CherryChatWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A wallet connect / token refresh changes the session — re-send config,
    // which remounts the chat inside the iframe (mirrors the RN wrapper).
    if (_ready && !widget.config.sameSession(oldWidget.config)) {
      _sendConfig();
    }
  }

  void _sendConfig() {
    final json = jsonEncode(widget.config.toJson());
    _controller.runJavaScript('window.__cherryReceiveConfig(${jsonEncode(json)})');
  }

  Future<void> _onMessage(JavaScriptMessage message) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(message.message) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    switch (msg['type']) {
      case 'ready':
        _ready = true;
        _sendConfig();
        break;

      case 'sign':
        final id = msg['id'] as String;
        try {
          final bytes = base64.decode(msg['message'] as String);
          final signature = await widget.onSign(bytes);
          final sigB64 = base64.encode(signature);
          _controller.runJavaScript(
            'window.__cherrySignResult(${jsonEncode(id)}, ${jsonEncode(sigB64)}, null)',
          );
        } catch (e) {
          _controller.runJavaScript(
            'window.__cherrySignResult(${jsonEncode(id)}, null, ${jsonEncode(e.toString())})',
          );
        }
        break;

      case 'event':
        final event = msg['event'] as String?;
        if (event == null) break;
        if (event == 'walletConnectRequested') widget.onWalletConnectRequested?.call();
        widget.onEvent?.call(event, msg['data']);
        break;
    }
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);
}
