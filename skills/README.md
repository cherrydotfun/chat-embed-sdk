# Cherry Embed SDK Skills

AI-powered integration assistant for `@cherrydotfun/chat-embed-sdk`.

## Available Skills

### `cherry-embed-integration`

Guides you through embedding a Cherry Chat public room into an existing web3 Solana application with zero-signature authentication.

The skill:
1. Analyzes your project (framework, wallet setup, backend)
2. Creates a backend endpoint to generate embed tokens
3. Mounts the chat widget with custom theming
4. Sets up token refresh and event handling
5. Verifies the integration end-to-end

## Installation

### Claude Code

```bash
# Copy skill to global skills directory
cp -r node_modules/@cherrydotfun/chat-embed-sdk/skills/cherry-embed-integration ~/.claude/skills/

# Or symlink (updates with package)
ln -s $(pwd)/node_modules/@cherrydotfun/chat-embed-sdk/skills/cherry-embed-integration ~/.claude/skills/cherry-embed-integration
```

### Codex

```bash
cp -r node_modules/@cherrydotfun/chat-embed-sdk/skills/cherry-embed-integration ~/.agents/skills/
```

### Project-Level (CLAUDE.md)

Add to your project's `CLAUDE.md`:

```markdown
## Skills

- Cherry Embed Integration: `node_modules/@cherrydotfun/chat-embed-sdk/skills/cherry-embed-integration/SKILL.md`
```

## Usage

In Claude Code or Codex, say:

> "Add Cherry Chat embed to this project"

or

> "Integrate @cherrydotfun/chat-embed-sdk"

The skill will activate and guide you through each step.
