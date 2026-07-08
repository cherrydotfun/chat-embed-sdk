export function Marketing() {
  return (
    <section className="marketing">
      <div className="marketing-eyebrow">
        <span>Cherry Embed</span>
        <a
          className="marketing-eyebrow-link"
          href="https://github.com/cherrydotfun/chat-embed-sdk"
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>GitHub</span>
        </a>
      </div>
      <h1 className="marketing-title">
        Drop-in wallet-native chat for any dApp
      </h1>
      <p className="marketing-lede">
        One <code>&lt;script&gt;</code> tag and a <code>div</code>. The iframe
        handles wallet connect, signing, and the entire chat surface — your
        page stays the way you built it.
      </p>

      <div className="marketing-grid">
        <div className="marketing-card">
          <div className="marketing-card-title">Nothing to deploy</div>
          <p className="marketing-card-body">
            Crypto-native by default — visitors only need a wallet to start
            chatting. Reactions, replies, link &amp; token previews, moderation,
            avatars, usernames, roles, badges and the rest of the chat surface
            all live inside the Cherry iframe.
          </p>
        </div>

        <div className="marketing-card">
          <div className="marketing-card-title">Themable end-to-end</div>
          <p className="marketing-card-body">
            Pick one of the presets below or twist any individual colour
            or font live.
          </p>
        </div>

        <div className="marketing-card">
          <div className="marketing-card-title">
            Discoverable on Cherry
            <span className="marketing-tag">optional</span>
          </div>
          <p className="marketing-card-body">
            Every embedded room can be automatically published on
            {' '}<a className="marketing-link" href="https://chat.cherry.fun" target="_blank" rel="noreferrer">
              chat.cherry.fun
            </a>{' '}
            — your community becomes visible to thousands of existing Cherry
            users from day one.
          </p>
        </div>
      </div>

      <details className="marketing-snippet">
        <summary>Show the integration snippet</summary>
        <pre>
          <code>{`<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.5/dist/index.global.js"></script>
<div id="chat"></div>
<script>
  new window.CherryEmbedSDK.CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    roomId: 'room-id',         // optional
    theme: { mode: 'dark' },   // optional
  }).mount();
</script>`}</code>
        </pre>
        <p className="marketing-snippet-source">
          Full SDK reference, types &amp; source on{' '}
          <a
            className="marketing-link"
            href="https://github.com/cherrydotfun/chat-embed-sdk"
            target="_blank"
            rel="noreferrer"
          >
            github.com/cherrydotfun/chat-embed-sdk
          </a>
          .
        </p>
      </details>
    </section>
  );
}
