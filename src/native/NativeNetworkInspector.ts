import { NativeModules } from 'react-native';

const getModule = () => NativeModules?.NetworkInspectorModule;

export const NativeNetworkInspector = {
  isAvailable(): boolean {
    return !!getModule();
  },

  async getLocalIpAddress(): Promise<string> {
    const mod = getModule();
    if (mod) {
      return mod.getLocalIpAddress();
    }
    return '192.168.1.42'; // Simulation IP for preview
  },

  async isPortAvailable(port: number): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.isPortAvailable(port);
    }
    return true;
  },

  async startForegroundService(title?: string, content?: string): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.startForegroundService(title, content);
    }
    return true;
  },

  async stopForegroundService(): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.stopForegroundService();
    }
    return true;
  },

  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.isIgnoringBatteryOptimizations();
    }
    return true;
  },

  async requestIgnoreBatteryOptimizations(): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.requestIgnoreBatteryOptimizations();
    }
    return true;
  },
};
