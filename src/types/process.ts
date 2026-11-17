export type SessionType = 'BOOTSTRAP' | 'BUILD' | 'RUNTIME_SERVER' | 'TUNNEL' | 'SHELL';

export type NativeProcessStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPED' | 'FAILED';

export interface ProcessOutputEvent {
  sessionId: string;
  text: string;
  streamType: 'stdout' | 'stderr';
  timestamp: number;
}

export interface ProcessStatusChangeEvent {
  sessionId: string;
  status: NativeProcessStatus;
  exitCode?: number | null;
  timestamp: number;
}

export interface TunnelUrlEvent {
  provider: 'cloudflare' | 'zrok';
  url: string;
  port: number;
  timestamp: number;
}

export interface TunnelStatusEvent {
  provider: string;
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  url?: string | null;
  timestamp: number;
}

export interface BootstrapProgressEvent {
  step: string;
  message: string;
  percentage: number;
}

export interface LogLine {
  id: string;
  sessionId: string;
  projectId?: string;
  projectName?: string;
  channel: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: number;
}
