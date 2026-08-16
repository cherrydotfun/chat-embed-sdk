/**
 * Type shim for the IIFE bundle attached to `window.CherryEmbedSDK` by
 * `<script src="/cherry-embed.js">` in index.html.
 *
 * Only the surface the demo actually uses is declared. The full SDK
 * package is not pulled into the demo's TS resolution because it lives
 * outside this Vite root (and ships as JS at runtime anyway).
 */
import type { EmbedLayout, EmbedTheme } from './types';

export interface MountOptions {
  appId: string;
  container: HTMLElement | string;
  embedUrl?: string;
  roomId?: string;
  theme?: EmbedTheme;
  layout?: EmbedLayout;
  position?: 'inline' | 'floating-right' | 'floating-left';
  collapsed?: boolean;
}

export interface ChatHandle {
  mount(): Promise<void>;
  destroy(): void;
  setTheme(theme: Partial<EmbedTheme>): void;
  resetTheme(): void;
  setLayout(layout: Partial<EmbedLayout>): void;
  setRoom(roomId: string): void;
  show(): void;
  hide(): void;
  toggle(): void;
  on(event: string, cb: (data: unknown) => void): void;
}

interface SdkGlobal {
  CherryEmbed: new (config: MountOptions) => ChatHandle;
}

declare global {
  interface Window {
    CherryEmbedSDK?: SdkGlobal;
  }
}

export function getSdk(): SdkGlobal {
  const sdk = window.CherryEmbedSDK;
  if (!sdk) {
    throw new Error(
      'window.CherryEmbedSDK is not available. Did /cherry-embed.js fail to load?',
    );
  }
  return sdk;
}
