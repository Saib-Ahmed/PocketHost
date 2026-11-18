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

export interface PackageStatusInfo {
  isInstalled: boolean;
  sizeMb: number;
  path: string;
  version: string;
}

export interface PackageProgressEvent {
  packageId: string;
  status: 'STARTING' | 'DOWNLOADING' | 'EXTRACTING' | 'INSTALLED' | 'FAILED';
  percentage: number;
  downloadedMb: number;
  totalMb: number;
  message: string;
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
      return true;
    } finally {
      sub?.remove();
    }
  },

  async getPackageStatuses(): Promise<Record<string, PackageStatusInfo>> {
    const mod = getModule();
    if (mod?.getPackageStatuses) {
      return mod.getPackageStatuses();
    }
    return {
      cloudflared: { isInstalled: false, sizeMb: 36.0, path: '/data/data/com.pockethost/files/bin/cloudflared', version: 'v2026.11.1' },
      zrok: { isInstalled: false, sizeMb: 24.0, path: '/data/data/com.pockethost/files/bin/zrok', version: 'v0.4.42' },
      proot: { isInstalled: false, sizeMb: 4.1, path: '/data/data/com.pockethost/files/bin/proot', version: 'v5.4.1' },
      nodejs: { isInstalled: false, sizeMb: 46.5, path: '/data/data/com.pockethost/files/bin/node', version: 'v20.18.0' },
      python: { isInstalled: false, sizeMb: 38.2, path: '/data/data/com.pockethost/files/bin/python3', version: 'v3.12' },
      git: { isInstalled: false, sizeMb: 16.2, path: '/data/data/com.pockethost/files/bin/git', version: 'v2.45' },
    };
  },

  async installPackage(packageId: string): Promise<any> {
    const mod = getModule();
    if (mod?.installPackage) {
      return mod.installPackage(packageId);
    }
    return { success: true, packageId };
  },

  async uninstallPackage(packageId: string): Promise<any> {
    const mod = getModule();
    if (mod?.uninstallPackage) {
      return mod.uninstallPackage(packageId);
    }
    return { success: true, packageId, freedMb: 0 };
  },

  async writeProjectFiles(projectId: string, files: Record<string, string>): Promise<string> {
    const mod = getModule();
    if (mod?.writeProjectFiles) {
      return mod.writeProjectFiles(projectId, files);
    }
    return `/data/data/com.pockethost/files/projects/${projectId}`;
  },

  async pickProjectZip(projectId: string): Promise<{ success: boolean; fileName: string; filesCount: number; sizeMb: number; projectDir: string }> {
    const mod = getModule();
    if (mod?.pickProjectZip) {
      return mod.pickProjectZip(projectId);
    }
    return { success: true, fileName: 'uploaded-code.zip', filesCount: 5, sizeMb: 1.2, projectDir: `/data/data/com.pockethost/files/projects/${projectId}` };
  },

  async deleteProjectDir(projectId: string): Promise<boolean> {
    const mod = getModule();
    if (mod?.deleteProjectDir) {
      return mod.deleteProjectDir(projectId);
    }
    return true;
  },

  async cleanCache(): Promise<number> {
    const mod = getModule();
    if (mod?.cleanCache) {
      return mod.cleanCache();
    }
    return 0;
  },

  async getExecutionCommand(command: string, workspacePath?: string): Promise<string[]> {
    const mod = getModule();
    if (mod) {
      return mod.getExecutionCommand(command, workspacePath);
    }
    return ['/system/bin/sh', '-c', command];
  },

  async executeShellCommand(
    command: string,
    workspacePath?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const mod = getModule();
    if (mod?.executeShellCommand) {
      return mod.executeShellCommand(command, workspacePath);
    }
    return { stdout: '', stderr: 'Native PRoot module unavailable', exitCode: 1 };
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
    return { remove: () => {} };
  },

  onPackageProgress(callback: (event: PackageProgressEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onPackageInstallProgress', callback);
    }
    return { remove: () => {} };
  },
};
