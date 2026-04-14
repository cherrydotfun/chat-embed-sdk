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

export interface BridgeRequest extends BridgeMessage {
  type: 'cherry:request';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeResponse extends BridgeMessage {
  type: 'cherry:response';
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}
