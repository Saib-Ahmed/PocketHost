import { NativeModules, DeviceEventEmitter } from 'react-native';
import {
  ProcessOutputEvent,
  ProcessStatusChangeEvent,
  SessionType,
} from '../types/process';

const getModule = () => NativeModules?.ProcessManagerModule;

type ListenerCallback = (data: any) => void;
const simulatedListeners: Record<string, ListenerCallback[]> = {};

export const NativeProcessManager = {
  isAvailable(): boolean {
    return !!getModule();
  },

  async createSession(
    sessionId: string,
    command: string[],
    workingDir?: string,
    env?: Record<string, string>,
    sessionType: SessionType = 'SHELL'
  ): Promise<string> {
    const mod = getModule();
    if (mod) {
      return mod.createSession(sessionId, command, workingDir, env, sessionType);
    }
    return sessionId;
  },

  async startSession(sessionId: string): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.startSession(sessionId);
    }
    // Simulation mode
    setTimeout(() => {
      simulatedListeners['onProcessStatusChange']?.forEach((cb) =>
        cb({ sessionId, status: 'RUNNING', exitCode: null, timestamp: Date.now() })
      );
      simulatedListeners['onProcessOutput']?.forEach((cb) =>
        cb({
          sessionId,
          text: `[PocketHost Engine] Service process initialized (PID: ${Math.floor(
            Math.random() * 8000 + 1000
          )})\n`,
          streamType: 'stdout',
          timestamp: Date.now(),
        })
      );
    }, 500);
    return true;
  },

  async writeStdin(sessionId: string, input: string): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.writeStdin(sessionId, input);
    }
    // Echo in simulation
    simulatedListeners['onProcessOutput']?.forEach((cb) =>
      cb({
        sessionId,
        text: `> ${input}\n`,
        streamType: 'stdout',
        timestamp: Date.now(),
      })
    );
    return true;
  },

  async startProjectServer(
    projectId: string,
    projectName: string,
    stackId: string,
    port: number
  ): Promise<boolean> {
    const mod = getModule();
    if (mod?.startProjectServer) {
      return mod.startProjectServer(projectId, projectName, stackId, port);
    }
    return true;
  },

  async stopProjectServer(projectId: string): Promise<boolean> {
    const mod = getModule();
    if (mod?.stopProjectServer) {
      return mod.stopProjectServer(projectId);
    }
    return true;
  },

  async terminateSession(sessionId: string, force: boolean = false): Promise<boolean> {
    const mod = getModule();
    if (mod) {
      return mod.terminateSession(sessionId, force);
    }
    simulatedListeners['onProcessStatusChange']?.forEach((cb) =>
      cb({ sessionId, status: 'STOPPED', exitCode: 0, timestamp: Date.now() })
    );
    return true;
  },

  async listSessions(): Promise<any[]> {
    const mod = getModule();
    if (mod) {
      return mod.listSessions();
    }
    return [];
  },

  async getSessionStatus(sessionId: string): Promise<any> {
    const mod = getModule();
    if (mod) {
      return mod.getSessionStatus(sessionId);
    }
    return { sessionId, status: 'RUNNING' };
  },

  onOutput(callback: (event: ProcessOutputEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onProcessOutput', callback);
    }
    if (!simulatedListeners['onProcessOutput']) simulatedListeners['onProcessOutput'] = [];
    simulatedListeners['onProcessOutput'].push(callback);
    return {
      remove: () => {
        simulatedListeners['onProcessOutput'] = simulatedListeners['onProcessOutput']?.filter(
          (cb) => cb !== callback
        );
      },
    };
  },

  onStatusChange(callback: (event: ProcessStatusChangeEvent) => void) {
    if (this.isAvailable()) {
      return DeviceEventEmitter.addListener('onProcessStatusChange', callback);
    }
    if (!simulatedListeners['onProcessStatusChange'])
      simulatedListeners['onProcessStatusChange'] = [];
    simulatedListeners['onProcessStatusChange'].push(callback);
    return {
      remove: () => {
        simulatedListeners['onProcessStatusChange'] = simulatedListeners[
          'onProcessStatusChange'
        ]?.filter((cb) => cb !== callback);
      },
    };
  },
};
