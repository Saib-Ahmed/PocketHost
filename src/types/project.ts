import { TechStackId } from './stack';

export type ProjectStatus = 'STOPPED' | 'STARTING' | 'BUILDING' | 'RUNNING' | 'FAILED';

export type PublicUrlType = 'local' | 'cloudflare' | 'zrok';

export interface EnvVariable {
  key: string;
  value: string;
}

export type ProjectSourceType = 'STARTER_TEMPLATE' | 'UPLOAD_ZIP' | 'SELECT_FOLDER' | 'WIFI_UPLOAD' | 'GITHUB';

export interface ProjectItem {
  id: string;
  name: string;
  stackId: TechStackId;
  port: number;
  entryFile: string;
  startCommand: string;
  sourceType: ProjectSourceType;
  sourcePath?: string;
  zipFileName?: string;
  gitRepoUrl?: string;
  gitBranch?: string;
  gitToken?: string;
  publicUrlType: PublicUrlType;
  envVars: EnvVariable[];
  status: ProjectStatus;
  uptimeSeconds: number;
  activeUrl?: string;
  activeSessionId?: string;
  isDemo?: boolean;
  createdAt: number;
}

// Backward compatibility alias for single-project references
export type ProjectConfig = ProjectItem;

export interface DeploymentState {
  status: ProjectStatus;
  startedAt?: number;
  uptimeSeconds: number;
  localWifiUrl?: string;
  cloudflareUrl?: string;
  zrokUrl?: string;
  memoryMb?: number;
  cpuPercent?: number;
  lastExitCode?: number;
  activeSessionId?: string;
}
