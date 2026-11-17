import { NativeModules, DeviceEventEmitter } from 'react-native';
import { BootstrapProgressEvent } from '../types/process';

const getModule = () => NativeModules?.PRootBootstrapModule;

type ListenerCallback = (data: any) => void;
const simulatedListeners: Record<string, ListenerCallback[]> = {};

export interface EnvironmentInfo {
  isReady: boolean;
  rootDir: string;
  binDir: string;
  projectsDir: string;
}

export const NativePRootBootstrap = {
  isAvailable(): boolean {
    return !!getModule();
  },

  async isEnvironmentReady(): Promise<EnvironmentInfo> {
    const mod = getModule();
    if (mod) {
      return mod.isEnvironmentReady();
    }
    return {
      isReady: true,
      rootDir: '/data/user/0/com.pockethost/files/rootfs',
      binDir: '/data/user/0/com.pockethost/files/bin',
      projectsDir: '/data/user/0/com.pockethost/files/projects',
    };
  },

  async initializeEnvironment(onProgress?: (progress: BootstrapProgressEvent) => void): Promise<boolean> {
    const sub = onProgress ? this.onProgress(onProgress) : null;
    try {
      const mod = getModule();
      if (mod) {
        const result = await mod.initializeEnvironment();
        return result.success;
      }

      // Simulation fallback for development / Expo Go
      if (onProgress) {
        onProgress({ step: 'PREPARING_DIRS', message: 'Creating isolated directory structure...', percentage: 20 });
        await new Promise((r) => setTimeout(r, 500));
        onProgress({ step: 'CONFIGURING_DNS', message: 'Setting up network DNS resolvers (1.1.1.1, 8.8.8.8)...', percentage: 45 });
        await new Promise((r) => setTimeout(r, 500));
        onProgress({ step: 'CHECKING_PROOT', message: 'Verifying PRoot execution engine...', percentage: 70 });
        await new Promise((r) => setTimeout(r, 500));
        onProgress({ step: 'SETTING_UP_WORKSPACE', message: 'Initializing project workspace...', percentage: 90 });
        await new Promise((r) => setTimeout(r, 400));
        onProgress({ step: 'READY', message: 'Linux execution environment is ready!', percentage: 100 });
      }
      return true;
    } finally {
      sub?.remove();
    }
  },

  async getExecutionCommand(command: string, workspacePath?: string): Promise<string[]> {
    const mod = getModule();
    if (mod) {
      return mod.getExecutionCommand(command, workspacePath);
    }
    return ['/bin/sh', '-c', command];
  },

  async getEnvironmentInfo(): Promise<any> {
    const mod = getModule();
    if (mod) {
      return mod.getEnvironmentInfo();
    }
    return {
      filesDir: '/data/user/0/com.pockethost/files',
      rootDir: '/data/user/0/com.pockethost/files/rootfs',
      binDir: '/data/user/0/com.pockethost/files/bin',
      projectsDir: '/data/user/0/com.pockethost/files/projects',
      abi: 'arm64-v8a',
    };
  },

  onProgress(callback: (event: BootstrapProgressEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onBootstrapProgress', callback);
    }
    if (!simulatedListeners['onBootstrapProgress']) simulatedListeners['onBootstrapProgress'] = [];
    simulatedListeners['onBootstrapProgress'].push(callback);
    return {
      remove: () => {
        simulatedListeners['onBootstrapProgress'] = simulatedListeners[
          'onBootstrapProgress'
        ]?.filter((cb) => cb !== callback);
      },
    };
  },
};
