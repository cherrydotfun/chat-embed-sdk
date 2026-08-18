/**
 * Host-provided identity — the SDK's half of the contract.
 *
 * The iframe PULLS (`users.resolve` / `users.search` / `users.get`) and the
 * host PUSHES (`users.update` / `users.invalidate` / `users.auth`). What is
 * pinned here is the part an integrator can actually get wrong, plus the one
 * property the iframe depends on: an unregistered method must fail FAST with
 * METHOD_NOT_FOUND, because that is how the iframe detects "this host can't
 * answer" instead of waiting out a timeout on every wallet in the room.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CherryEmbed } from '../embed';
import type { BridgeRequest, BridgeResponse } from '../types';

/** Captured postMessage calls, shared with the mocked iframe factory. */
const posted: Posted[] = [];

/**
 * Every embed mounted by a test. They MUST be destroyed afterwards: an
 * un-destroyed CherryEmbed keeps its bridge listening on `window`, and a stale
 * one (with no handlers registered) would answer the next test's request first
 * — the incoming-request protocol has no per-instance addressing.
 */
const mounted: CherryEmbed[] = [];

vi.mock('../iframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../iframe')>();
  return {
    ...actual,
    createEmbedIframe: vi.fn(() => {
      return {
        style: {},
        contentWindow: {
          postMessage(message: unknown, targetOrigin: string) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            posted.push({ message, targetOrigin });
          },
        },
        remove: vi.fn(),
      } as unknown as HTMLIFrameElement;
    }),
  };
});

const EMBED_ORIGIN = 'https://embed.cherry.fun';

interface Posted {
  message: unknown;
  targetOrigin: string;
}

/**
 * Mount a CherryEmbed against a stubbed iframe and capture everything the SDK
 * posts into it. `mount()` waits for a `ready` event, so the harness emits one.
 */
async function mountEmbed(
  config: Partial<ConstructorParameters<typeof CherryEmbed>[0]> = {},
): Promise<{ chat: CherryEmbed; posted: Posted[] }> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const chat = new CherryEmbed({
    appId: 'app-test',
    container,
    roomId: 'room-1',
    ...config,
  });

  mounted.push(chat);
  const mountPromise = chat.mount();
  // The iframe announces readiness; without it mount() rejects on timeout.
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: EMBED_ORIGIN,
      data: { type: 'cherry:event', event: 'ready' },
    }),
  );
  await mountPromise;
  return { chat, posted };
}

/** Send a cherry:request as the iframe would, and await the SDK's response. */
async function request(
  posted: Posted[],
  req: Omit<BridgeRequest, 'type'>,
): Promise<BridgeResponse> {
  const before = posted.length;
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: EMBED_ORIGIN,
      data: { type: 'cherry:request', ...req },
    }),
  );
  // Responses are posted from an async handler — poll the capture buffer.
  for (let i = 0; i < 50; i++) {
    const response = posted
      .slice(before)
      .map((p) => p.message as BridgeResponse)
      .find((m) => m?.type === 'cherry:response' && m.id === req.id);
    if (response) return response;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`no response for request ${req.id}`);
}

/** The most recent command of one method (the SDK's lib target predates `.at`). */
function lastCommand(all: Posted[], method: string): Record<string, unknown> | undefined {
  const list = commands(all, method);
  return list[list.length - 1];
}

/** Commands of one method, in the order the SDK sent them. */
function commands(posted: Posted[], method: string): Record<string, unknown>[] {
  return posted
    .map((p) => p.message as { type?: string; method?: string; params?: Record<string, unknown> })
    .filter((m) => m?.type === 'cherry:cmd' && m.method === method)
    .map((m) => m.params ?? {});
}

beforeEach(() => {
  document.body.innerHTML = '';
  posted.length = 0;
});

afterEach(() => {
  for (const chat of mounted) chat.destroy();
  mounted.length = 0;
  // NOT restoreAllMocks: that would undo the module-level `../iframe` mock and
  // leave later tests constructing a real iframe (no contentWindow to capture).
  vi.clearAllMocks();
});

describe('users.resolve', () => {
  it('hands the iframe the profiles the host returns', async () => {
    const resolveUsers = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { displayName: `User ${id}` }])),
    );
    const { posted } = await mountEmbed({ resolveUsers });

    const response = await request(posted, {
      id: 'r1',
      method: 'users.resolve',
      params: { ids: ['WalletA', 'WalletB'] },
    });

    expect(resolveUsers).toHaveBeenCalledWith(['WalletA', 'WalletB']);
    expect(response.result).toEqual({
      users: { WalletA: { displayName: 'User WalletA' }, WalletB: { displayName: 'User WalletB' } },
    });
  });

  it('answers METHOD_NOT_FOUND when the host registered no handler', async () => {
    const { posted } = await mountEmbed();

    const response = await request(posted, {
      id: 'r1',
      method: 'users.resolve',
      params: { ids: ['WalletA'] },
    });

    expect(response.error?.code).toBe('METHOD_NOT_FOUND');
  });

  it('drops non-string ids before calling the host', async () => {
    const resolveUsers = vi.fn(async () => ({}));
    const { posted } = await mountEmbed({ resolveUsers });

    await request(posted, {
      id: 'r1',
      method: 'users.resolve',
      params: { ids: ['WalletA', 42, null, ''] },
    });

    expect(resolveUsers).toHaveBeenCalledWith(['WalletA']);
  });

  it('never calls the host with an empty batch', async () => {
    const resolveUsers = vi.fn(async () => ({}));
    const { posted } = await mountEmbed({ resolveUsers });

    const response = await request(posted, {
      id: 'r1',
      method: 'users.resolve',
      params: { ids: [] },
    });

    expect(resolveUsers).not.toHaveBeenCalled();
    expect(response.result).toEqual({ users: {} });
  });

  it('surfaces a thrown host error instead of pretending nobody is known', async () => {
    const { posted } = await mountEmbed({
      resolveUsers: async () => {
        throw new Error('directory offline');
      },
    });

    const response = await request(posted, {
      id: 'r1',
      method: 'users.resolve',
      params: { ids: ['WalletA'] },
    });

    expect(response.error?.code).toBe('HANDLER_ERROR');
    expect(response.error?.message).toContain('directory offline');
  });
});

describe('users.search', () => {
  it('forwards query, cursor and limit, and returns the page', async () => {
    const searchUsers = vi.fn(async () => ({
      users: [{ id: 'WalletA', displayName: 'Alice' }],
      nextCursor: 'page-2',
    }));
    const { posted } = await mountEmbed({ searchUsers });

    const response = await request(posted, {
      id: 'r1',
      method: 'users.search',
      params: { query: 'al', cursor: 'page-1', limit: 25 },
    });

    expect(searchUsers).toHaveBeenCalledWith({ query: 'al', cursor: 'page-1', limit: 25 });
    expect(response.result).toEqual({
      users: [{ id: 'WalletA', displayName: 'Alice' }],
      nextCursor: 'page-2',
    });
  });

  it('defaults the limit when the iframe omits it', async () => {
    const searchUsers = vi.fn(async () => ({ users: [] }));
    const { posted } = await mountEmbed({ searchUsers });

    await request(posted, { id: 'r1', method: 'users.search', params: {} });

    expect(searchUsers).toHaveBeenCalledWith({ query: undefined, cursor: undefined, limit: 10 });
  });
});

describe('users.get', () => {
  it('returns the host profile, and null when unknown', async () => {
    const getUser = vi.fn(async (id: string) =>
      id === 'WalletA' ? { displayName: 'Alice' } : null,
    );
    const { posted } = await mountEmbed({ getUser });

    const found = await request(posted, {
      id: 'r1',
      method: 'users.get',
      params: { id: 'WalletA' },
    });
    expect(found.result).toEqual({ displayName: 'Alice' });

    const missing = await request(posted, {
      id: 'r2',
      method: 'users.get',
      params: { id: 'WalletZ' },
    });
    expect(missing.result).toBeNull();
  });

  it('rejects a request with no wallet id', async () => {
    const { posted } = await mountEmbed({ getUser: async () => null });

    const response = await request(posted, { id: 'r1', method: 'users.get', params: {} });
    expect(response.error?.code).toBe('HANDLER_ERROR');
  });
});

describe('push commands', () => {
  it('sends mount-time profiles and the identity token during init', async () => {
    const { posted } = await mountEmbed({
      userProfiles: { WalletA: { displayName: 'Alice' } },
      identityToken: 'tok-1',
    });

    expect(commands(posted, 'users.update')).toEqual([
      { users: { WalletA: { displayName: 'Alice' } } },
    ]);
    expect(commands(posted, 'users.auth')).toEqual([{ token: 'tok-1' }]);
  });

  it('setUserProfiles pushes an update and remembers it for a reload', async () => {
    const { chat, posted } = await mountEmbed();

    chat.setUserProfiles({ WalletA: { displayName: 'Alice' } });
    expect(commands(posted, 'users.update')).toEqual([
      { users: { WalletA: { displayName: 'Alice' } } },
    ]);

    // A null entry means "I no longer know this wallet" — pushed through, and
    // dropped from the replay map so a reload doesn't resurrect the old name.
    chat.setUserProfiles({ WalletA: null });
    expect(commands(posted, 'users.update')).toHaveLength(2);
    expect(
      (chat as unknown as { config: { userProfiles?: Record<string, unknown> } }).config
        .userProfiles,
    ).toEqual({});
  });

  it('setUserProfiles ignores an empty payload', async () => {
    const { chat, posted } = await mountEmbed();
    chat.setUserProfiles({});
    expect(commands(posted, 'users.update')).toHaveLength(0);
  });

  it('invalidateUserProfiles targets ids, or everything when omitted', async () => {
    const { chat, posted } = await mountEmbed({
      userProfiles: { WalletA: { displayName: 'Alice' }, WalletB: { displayName: 'Bob' } },
    });

    chat.invalidateUserProfiles(['WalletA']);
    expect(lastCommand(posted, 'users.invalidate')).toEqual({ ids: ['WalletA'] });

    chat.invalidateUserProfiles();
    expect(lastCommand(posted, 'users.invalidate')).toEqual({});
    expect(
      (chat as unknown as { config: { userProfiles?: Record<string, unknown> } }).config
        .userProfiles,
    ).toBeUndefined();
  });

  it('setIdentityToken refreshes the token and can clear it', async () => {
    const { chat, posted } = await mountEmbed();

    chat.setIdentityToken('tok-2');
    expect(lastCommand(posted, 'users.auth')).toEqual({ token: 'tok-2' });

    chat.setIdentityToken(undefined);
    expect(lastCommand(posted, 'users.auth')).toEqual({ token: '' });
  });
});
