/**
 * cherryHostHtml.ts — the Cherry Chat host page as a bundled string.
 *
 * EXAMPLE 2 — HOST PAGE THAT LIVES IN YOUR RN REPO
 * ================================================
 * Instead of deploying a separate web page (Example 1 / `host.html`), the host
 * page ships inside your React Native bundle and is loaded with
 * `<WebView source={{ html: buildCherryHostHtml(...) }} />`.
 *
 * The chat itself is still a hosted iframe (embed.cherry.fun) and the SDK is
 * still JS that must be fetched — a WebView `source={{ html }}` document has no
 * origin to resolve a relative `<script src>` against, so you point it at a
 * FULL URL. The simplest is the Cherry-hosted rolling bundle (same origin as
 * the chat iframe), which is what the example uses:
 *
 *     https://embed.cherry.fun/cherry-embed.js
 *
 * Prefer to self-host? Build and upload it yourself:
 *
 *     cd cherry-embed-sdk && npm run build      # produces dist/index.global.js
 *     # upload dist/index.global.js to a URL you control, e.g.
 *     #   https://cdn.yoursite.com/cherry-embed.js
 *
 * Then pass that URL as `sdkUrl`. For a fully offline host page you can inline
 * the bundle contents instead of a <script src> (see the note at the bottom).
 *
 * The body of this page is byte-for-byte the same protocol as `host.html`; only
 * the SDK <script> tag differs. Keeping them separate (not DRY) is intentional
 * so each example is self-contained.
 */

export interface BuildCherryHostHtmlOptions {
  /**
   * Absolute URL of the built SDK IIFE bundle (dist/index.global.js), hosted
   * somewhere your device can reach. Exposes `window.CherryEmbedSDK`.
   */
  sdkUrl: string;
}

export function buildCherryHostHtml({ sdkUrl }: BuildCherryHostHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>Cherry Chat — React Native host (bundled)</title>
  <script src="${sdkUrl}"></script>
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

    function toRN(msg) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
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
        toRN({ type: 'event', event: 'error', data: { code: 'BAD_CONFIG', message: String(e) } });
        return;
      }
      if (chat) { try { chat.destroy(); } catch (_) {} chat = null; }
      mount(cfg);
    };

    function requestSignatureFromRN(messageBytes) {
      var id = 'sign_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      return new Promise(function (resolve, reject) {
        pendingSigns[id] = { resolve: resolve, reject: reject };
        toRN({ type: 'sign', id: id, message: bytesToB64(messageBytes) });
      });
    }

    function mount(cfg) {
      var SDK = window.CherryEmbedSDK;
      if (!SDK || !SDK.CherryEmbed) {
        toRN({ type: 'event', event: 'error', data: { code: 'SDK_NOT_LOADED', message: 'CherryEmbedSDK global missing — check the sdkUrl <script src>' } });
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
          return requestSignatureFromRN(messageBytes);
        },
      });

      var events = ['ready', 'authStateChange', 'unreadCount', 'message', 'tokenExpired', 'error', 'walletConnectRequested', 'preview', 'roomChanged'];
      events.forEach(function (ev) {
        chat.on(ev, function (data) { toRN({ type: 'event', event: ev, data: data }); });
      });

      chat.mount().then(function () {
        toRN({ type: 'event', event: 'mounted' });
      }).catch(function (err) {
        toRN({ type: 'event', event: 'error', data: { code: 'MOUNT_FAILED', message: (err && err.message) || String(err) } });
      });
    }

    toRN({ type: 'ready' });
  })();
  </script>
</body>
</html>`;
}

// ── Fully-offline variant ────────────────────────────────────────────────
// If you cannot host `cherry-embed.js` anywhere, read the built bundle at
// build time and inline it instead of a <script src>. For example, generate a
// `sdkBundle.ts` from `dist/index.global.js` (`export const SDK_SOURCE = "..."`)
// and swap the <script src="..."></script> line above for:
//     <script>${'${SDK_SOURCE}'}</script>
// The chat iframe and Cherry API still require network access — only the host
// page + SDK become offline-bundled.
