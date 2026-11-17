import { NativeModules, DeviceEventEmitter } from 'react-native';
import { TunnelUrlEvent, TunnelStatusEvent } from '../types/process';

const getModule = () => NativeModules?.TunnelManagerModule;

type ListenerCallback = (data: any) => void;
const simulatedListeners: Record<string, ListenerCallback[]> = {};

export const NativeTunnelManager = {
  isAvailable(): boolean {
    return !!getModule();
  },

  async startTunnel(
    provider: 'cloudflare' | 'zrok',
    port: number
  ): Promise<{ provider: string; port: number; url?: string; status: string }> {
    const mod = getModule();
    if (mod) {
      return mod.startTunnel(provider, port);
    }

    // Simulation mode
    const mockSubdomain = 'pocket-' + Math.floor(1000 + Math.random() * 9000);
    const mockUrl =
      provider === 'zrok'
        ? `https://${mockSubdomain}.share.zrok.io`
        : `https://${mockSubdomain}.trycloudflare.com`;

    setTimeout(() => {
      simulatedListeners['onTunnelUrlGenerated']?.forEach((cb) =>
        cb({
          provider,
          url: mockUrl,
          port,
          timestamp: Date.now(),
        })
      );
      simulatedListeners['onTunnelStatusChanged']?.forEach((cb) =>
        cb({
          provider,
          status: 'CONNECTED',
          url: mockUrl,
          timestamp: Date.now(),
        })
      );
    }, 1000);

    return {
      provider,
      port,
      status: 'CONNECTING',
    };
  },

  async stopTunnel(provider: 'cloudflare' | 'zrok'): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.stopTunnel(provider);
    }
    simulatedListeners['onTunnelStatusChanged']?.forEach((cb) =>
      cb({
        provider,
        status: 'DISCONNECTED',
        url: null,
        timestamp: Date.now(),
      })
    );
    return true;
  },

  async getActiveTunnels(): Promise<any[]> {
    const mod = getModule();
    if (mod) {
      return mod.getActiveTunnels();
    }
    return [];
  },

  onUrlGenerated(callback: (event: TunnelUrlEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onTunnelUrlGenerated', callback);
    }
    if (!simulatedListeners['onTunnelUrlGenerated']) simulatedListeners['onTunnelUrlGenerated'] = [];
    simulatedListeners['onTunnelUrlGenerated'].push(callback);
    return {
      remove: () => {
        simulatedListeners['onTunnelUrlGenerated'] = simulatedListeners[
          'onTunnelUrlGenerated'
        ]?.filter((cb) => cb !== callback);
      },
    };
  },

  onStatusChanged(callback: (event: TunnelStatusEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onTunnelStatusChanged', callback);
    }
    if (!simulatedListeners['onTunnelStatusChanged']) simulatedListeners['onTunnelStatusChanged'] = [];
    simulatedListeners['onTunnelStatusChanged'].push(callback);
    return {
      remove: () => {
        simulatedListeners['onTunnelStatusChanged'] = simulatedListeners[
          'onTunnelStatusChanged'
        ]?.filter((cb) => cb !== callback);
      },
    };
  },
};
