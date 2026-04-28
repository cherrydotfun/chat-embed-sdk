export interface EmbedTheme {
  mode?: 'dark' | 'light';
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  textSecondaryColor?: string;
  fontFamily?: string;
  fontSize?: 'sm' | 'md' | 'lg';
  borderRadius?: string;
  avatarShape?: 'circle' | 'square';
  compact?: boolean;
}

export interface EmbedLayout {
  showHeader?: boolean;
  headerTitle?: string;
  showMemberCount?: boolean;
  showAvatars?: boolean;
  showTimestamps?: boolean;
  showReactions?: boolean;
  showInput?: boolean;
  maxHeight?: string;
}

export interface CherryEmbedConfig {
  appId: string;
  container: HTMLElement | string;
  token?: string;
  /** Optional wallet address. Forwarded to iframe on mount so it is
   *  available before the first `signChallenge` request arrives. */
  walletAddress?: string;
  roomId?: string;
  theme?: EmbedTheme;
  layout?: EmbedLayout;
  position?: 'inline' | 'floating-right' | 'floating-left';
  collapsed?: boolean;
  embedUrl?: string;
}

export type EmbedEventMap = {
  ready: void;
  unreadCount: number;
  message: { roomId: string; senderId: string; timestamp: number };
  authStateChange: boolean;
  tokenExpired: void;
  error: { code: string; message: string };
};

// Bridge protocol messages (host <-> iframe)
export interface BridgeMessage {
  type: 'cherry:cmd' | 'cherry:event' | 'cherry:request' | 'cherry:response';
}

export interface BridgeCommand extends BridgeMessage {
  type: 'cherry:cmd';
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeEvent extends BridgeMessage {
  type: 'cherry:event';
  event: string;
  data?: unknown;
}

// ---- Request/response (iframe→host direction) ----

/**
 * Concrete params for signChallenge requests sent by the iframe.
 * `message` is a base64-encoded byte array for the host wallet to sign.
 * Extends `Record<string, unknown>` so it is assignable to `BridgeRequest.params`.
 */
export interface SignChallengeParams extends Record<string, unknown> {
  message: string; // base64-encoded Uint8Array
}

/**
 * Successful signChallenge result returned to the iframe.
 * `signature` is the base64-encoded Ed25519 signature bytes.
 */
export interface SignChallengeResult {
  signature: string; // base64-encoded Uint8Array
}

/**
 * Typed request methods that the iframe may send to the host.
 * Extend this union when new request methods are added.
 */
export type BridgeRequestMethod = 'signChallenge';

export interface BridgeRequest extends BridgeMessage {
  type: 'cherry:request';
  /** Unique correlation id — the matching `cherry:response` must carry the same id. */
  id: string;
  method: BridgeRequestMethod;
  params?: Record<string, unknown>;
}

/** Specific shape for signChallenge requests. */
export interface SignChallengeRequest extends BridgeMessage {
  type: 'cherry:request';
  id: string;
  method: 'signChallenge';
  params: SignChallengeParams;
}

export interface BridgeResponse extends BridgeMessage {
  type: 'cherry:response';
  /** Must match the `id` of the originating `cherry:request`. */
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Specific shape for successful signChallenge responses. */
export interface SignChallengeResponse extends BridgeMessage {
  type: 'cherry:response';
  id: string;
  result: SignChallengeResult;
}

/** Type guard: narrows a BridgeRequest to a SignChallengeRequest. */
export function isSignChallengeRequest(req: BridgeRequest): req is SignChallengeRequest {
  return (
    req.method === 'signChallenge' &&
    req.params !== undefined &&
    typeof (req.params as Record<string, unknown>)['message'] === 'string'
  );
}
