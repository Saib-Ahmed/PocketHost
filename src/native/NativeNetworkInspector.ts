import { NativeModules } from 'react-native';

const getModule = () => NativeModules?.NetworkInspectorModule;

export interface SystemMetrics {
  totalRamMb: number;
  usedRamMb: number;
  availRamMb: number;
  ramUsagePercent: number;
  totalStorageMb: number;
  usedStorageMb: number;
  availStorageMb: number;
  appDataSizeMb: number;
  cpuCores: number;
  batteryLevel: number;
  isCharging: boolean;
  isLowMemory: boolean;
}

export const NativeNetworkInspector = {
  isAvailable(): boolean {
    return !!getModule();
  },

  async getSystemMetrics(): Promise<SystemMetrics> {
    const mod = getModule();
    if (mod?.getSystemMetrics) {
      return mod.getSystemMetrics();
    }
    return {
      totalRamMb: 6144,
      usedRamMb: 2450,
      availRamMb: 3694,
      ramUsagePercent: 39.8,
      totalStorageMb: 122880,
      usedStorageMb: 45000,
      availStorageMb: 77880,
      appDataSizeMb: 0,
      cpuCores: 8,
      batteryLevel: 85,
      isCharging: false,
      isLowMemory: false,
    };
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
