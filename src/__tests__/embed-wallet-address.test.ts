import { describe, expect, it, vi } from 'vitest';
import { CherryEmbed } from '../embed';

describe('CherryEmbed wallet address command payload', () => {
  it('sends walletAddress during initial config sync', () => {
    const sendCommand = vi.fn();
    const chat = new CherryEmbed({
      appId: 'app-1',
      container: document.createElement('div'),
      walletAddress: 'Wallet111111111111111111111111111111111',
    });

    (chat as unknown as { bridge: { sendCommand: typeof sendCommand } }).bridge = {
      sendCommand,
    };

    (chat as unknown as { sendInitConfigs: () => void }).sendInitConfigs();

    expect(sendCommand).toHaveBeenCalledWith('setWalletAddress', {
      walletAddress: 'Wallet111111111111111111111111111111111',
    });
  });

  it('sends walletAddress when setWalletAddress is called', () => {
    const sendCommand = vi.fn();
    const chat = new CherryEmbed({
      appId: 'app-1',
      container: document.createElement('div'),
    });

    (chat as unknown as { bridge: { sendCommand: typeof sendCommand } }).bridge = {
      sendCommand,
    };

    chat.setWalletAddress('Wallet222222222222222222222222222222222');

    expect(sendCommand).toHaveBeenCalledWith('setWalletAddress', {
      walletAddress: 'Wallet222222222222222222222222222222222',
    });
  });
});
