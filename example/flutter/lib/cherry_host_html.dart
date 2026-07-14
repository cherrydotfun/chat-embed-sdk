/// cherry_host_html.dart — the Cherry Chat host page as a bundled string.
///
/// EXAMPLE 2 — HOST PAGE THAT LIVES IN YOUR FLUTTER REPO
/// =====================================================
/// Instead of deploying a separate web page (Example 1), the host page ships
/// inside your Flutter app and is loaded with `controller.loadHtmlString(...)`
/// via `CherryChatSource.html(...)`.
///
/// The chat itself is still a hosted iframe (embed.cherry.fun) and the SDK is
/// still JS that must be fetched — a `loadHtmlString` document has no origin to
/// resolve a relative `<script src>` against, so `sdkUrl` must be a FULL URL.
/// The simplest is the Cherry-hosted rolling bundle (same origin as the chat
/// iframe), which the example uses by default:
///
///     https://embed.cherry.fun/cherry-embed.js
///
/// Prefer to self-host? Build it yourself and upload it somewhere reachable:
///
///     cd cherry-embed-sdk && npm run build   # produces dist/index.global.js
///     # upload dist/index.global.js to e.g. https://cdn.yoursite.com/cherry-embed.js
///
/// The protocol here is identical to the React Native `host.html`; the page
/// auto-detects the platform (RN `window.ReactNativeWebView` vs Flutter's
/// `CherryNative` JavaScriptChannel).
///
/// NOTE on iOS: pass a `baseUrl` when loading (CherryChatSource.html does this)
/// so WKWebView allows the remote SDK `<script src>` from a null-origin doc.
library;

String buildCherryHostHtml({
  String sdkUrl = 'https://embed.cherry.fun/cherry-embed.js',
}) {
  return '''
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>Cherry Chat — Flutter host (bundled)</title>
  <script src="$sdkUrl"></script>
  <style>
    html, body, #chat { height: 100%; margin: 0; padding: 0; }
    body { background: transparent; }
    #chat { width: 100%; }
  </style>
</head>
<body>
  <div id="chat"></div>
  <script>
  (function () {
    var chat = null;
    var pendingSigns = {};

    // Platform-agnostic: RN exposes window.ReactNativeWebView; Flutter
    // (webview_flutter) exposes a JavaScriptChannel named "CherryNative".
    function toNative(msg) {
      var s = JSON.stringify(msg);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) { window.ReactNativeWebView.postMessage(s); return; }
      if (window.CherryNative && window.CherryNative.postMessage) { window.CherryNative.postMessage(s); return; }
    }

    function bytesToB64(bytes) {
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    function b64ToBytes(b64) {
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    window.__cherrySignResult = function (id, signatureB64, errorMsg) {
      var p = pendingSigns[id];
      if (!p) return;
      delete pendingSigns[id];
      if (errorMsg) p.reject(new Error(errorMsg));
      else p.resolve(b64ToBytes(signatureB64));
    };

    window.__cherryCommand = function (method, paramsJson) {
      if (!chat) return;
      var params = {};
      try { params = paramsJson ? JSON.parse(paramsJson) : {}; } catch (e) {}
      switch (method) {
        case 'setWalletAddress': chat.setWalletAddress(params.walletAddress); break;
        case 'setToken':         chat.setToken(params.token); break;
        case 'setRoom':          chat.setRoom(params.roomId); break;
        case 'setTheme':         chat.setTheme(params.theme || {}); break;
        case 'signOut':          chat.signOut(); break;
        case 'show':             chat.show(); break;
        case 'hide':             chat.hide(); break;
      }
    };

    window.__cherryReceiveConfig = function (configJson) {
      var cfg;
      try {
        cfg = JSON.parse(configJson);
      } catch (e) {
        toNative({ type: 'event', event: 'error', data: { code: 'BAD_CONFIG', message: String(e) } });
        return;
      }
      if (chat) { try { chat.destroy(); } catch (_) {} chat = null; }
      mount(cfg);
    };

    function requestSignatureFromNative(messageBytes) {
      var id = 'sign_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      return new Promise(function (resolve, reject) {
        pendingSigns[id] = { resolve: resolve, reject: reject };
        toNative({ type: 'sign', id: id, message: bytesToB64(messageBytes) });
      });
    }

    function mount(cfg) {
      var SDK = window.CherryEmbedSDK;
      if (!SDK || !SDK.CherryEmbed) {
        toNative({ type: 'event', event: 'error', data: { code: 'SDK_NOT_LOADED', message: 'CherryEmbedSDK global missing — check the sdkUrl <script src>' } });
        return;
      }

      chat = new SDK.CherryEmbed({
        appId: cfg.appId,
        container: '#chat',
        roomId: cfg.roomId || undefined,
        mode: cfg.mode || undefined,
        token: cfg.token || undefined,
        walletAddress: cfg.walletAddress || undefined,
        embedUrl: cfg.embedUrl || undefined,
        theme: cfg.theme || undefined,
        layout: cfg.layout || undefined,
        signChallengeHandler: function (messageBytes) {
          return requestSignatureFromNative(messageBytes);
        },
      });

      var events = ['ready', 'authStateChange', 'unreadCount', 'message', 'tokenExpired', 'error', 'walletConnectRequested', 'preview', 'roomChanged'];
      events.forEach(function (ev) {
        chat.on(ev, function (data) { toNative({ type: 'event', event: ev, data: data }); });
      });

      chat.mount().then(function () {
        toNative({ type: 'event', event: 'mounted' });
      }).catch(function (err) {
        toNative({ type: 'event', event: 'error', data: { code: 'MOUNT_FAILED', message: (err && err.message) || String(err) } });
      });
    }

    toNative({ type: 'ready' });
  })();
  </script>
</body>
</html>
''';
}
