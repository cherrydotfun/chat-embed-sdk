export function Marketing() {
  return (
    <section className="marketing">
      <div className="marketing-eyebrow">Cherry Embed</div>
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
            Pick one of the four presets below or twist any individual colour
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
          <code>{`<script src="https://cdn.cherry.fun/embed/cherry-embed.js"></script>
<div id="chat"></div>
<script>
  new CherryEmbedSDK.CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    roomId: 'room-id',         // optional
    theme: { mode: 'dark' },   // optional
  }).mount();
</script>`}</code>
        </pre>
      </details>
    </section>
  );
}
