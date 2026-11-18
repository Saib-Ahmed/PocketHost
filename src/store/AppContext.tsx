import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  TechStack,
  SUPPORTED_STACKS,
  TechStackId,
} from '../types/stack';
import {
  ProjectItem,
  ProjectConfig,
  DeploymentState,
  ProjectStatus,
  PublicUrlType,
} from '../types/project';
import { SoftwareItem } from '../types/software';
import { LogLine, BootstrapProgressEvent } from '../types/process';
import { NativeProcessManager } from '../native/NativeProcessManager';
import { NativePRootBootstrap, PackageProgressEvent } from '../native/NativePRootBootstrap';
import { NativeTunnelManager } from '../native/NativeTunnelManager';
import { NativeNetworkInspector } from '../native/NativeNetworkInspector';
import { getStarterFiles } from '../utils/starterTemplates';

interface AppContextType {
  isBootstrapReady: boolean;
  bootstrapProgress: BootstrapProgressEvent | null;
  initializeBootstrap: () => Promise<void>;

  projects: ProjectItem[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: ProjectItem;

  startProject: (id: string) => Promise<void>;
  stopProject: (id: string) => Promise<void>;
  restartProject: (id: string) => Promise<void>;
  createProject: (stackId: TechStackId, name?: string) => Promise<ProjectItem>;
  updateProject: (id: string, updates: Partial<ProjectItem>) => void;
  deleteProject: (id: string) => Promise<void>;

  // Software & Packages Management
  softwares: SoftwareItem[];
  installingPackageId: string | null;
  packageInstallProgress: PackageProgressEvent | null;
  refreshSoftwareStatuses: () => Promise<void>;
  uninstallSoftware: (id: string) => Promise<void>;
  installSoftware: (id: string) => Promise<void>;
  cleanCache: () => Promise<void>;
  totalStorageMb: number;

  // Single project compatibility aliases
  activeStack: TechStack;
  setActiveStack: (stack: TechStack) => void;
  projectConfig: ProjectConfig;
  updateProjectConfig: (updates: Partial<ProjectConfig>) => void;
  deploymentState: DeploymentState;
  startDeployment: () => Promise<void>;
  stopDeployment: () => Promise<void>;
  restartDeployment: () => Promise<void>;

  logs: LogLine[];
  addLog: (text: string, channel?: 'stdout' | 'stderr' | 'system', sessionId?: string, projectId?: string, projectName?: string) => void;
  clearLogs: (projectId?: string) => void;

  sendStdin: (input: string) => Promise<void>;
  localIpAddress: string;
  refreshLocalIp: () => Promise<void>;
  requestBatteryExemption: () => Promise<void>;
}

// Initial state: ZERO dummy projects. Real state only.
const initialProjects: ProjectItem[] = [];

// Initial softwares: All marked uninstalled until queried from device storage
const initialSoftwares: SoftwareItem[] = [
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel CLI',
    category: 'tunnel',
    version: 'v2026.11.1 (ARM64)',
    sizeMb: 36.0,
    icon: 'CF',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/bin/cloudflared',
    description: 'Official Cloudflare daemon exposing local ports to the internet over free *.trycloudflare.com HTTPS.',
  },
  {
    id: 'nodejs',
    name: 'Node.js & npm',
    category: 'runtime',
    version: 'v20.18.0 (ARM64)',
    sizeMb: 46.5,
    icon: 'JS',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/bin/node',
    description: 'JavaScript runtime & package manager for running backend APIs and fullstack applications.',
  },
  {
    id: 'python',
    name: 'Python 3 & pip',
    category: 'runtime',
    version: 'v3.12 (ARM64)',
    sizeMb: 38.2,
    icon: 'PY',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/bin/python3',
    description: 'Python interpreter for Flask, FastAPI, and ASGI web microservices.',
  },
  {
    id: 'zrok',
    name: 'zrok Client',
    category: 'tunnel',
    version: 'v0.4.42 (OpenZiti)',
    sizeMb: 24.0,
    icon: 'ZROK',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/bin/zrok',
    description: 'High-speed peer-to-peer decentralized tunnel daemon for public and private access.',
  },
  {
    id: 'git',
    name: 'Git Version Control',
    category: 'tool',
    version: 'v2.45 (ARM64)',
    sizeMb: 16.2,
    icon: 'GIT',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/bin/git',
    description: 'Source control tool for cloning repositories directly from GitHub and GitLab.',
  },
  {
    id: 'proot',
    name: 'PRoot Linux Core',
    category: 'core',
    version: 'v5.4.1 (ARM64 ptrace)',
    sizeMb: 4.1,
    icon: 'CORE',
    isInstalled: false,
    isCore: true,
    path: '/data/data/com.pockethost/files/bin/proot',
    description: 'System call interception layer enabling Linux userland without root permissions.',
  },
];

const emptyFallbackProject: ProjectItem = {
  id: '',
  name: 'No Projects Created',
  stackId: 'node-api',
  port: 3000,
  entryFile: 'server.js',
  startCommand: 'node server.js',
  sourceType: 'STARTER_TEMPLATE',
  publicUrlType: 'cloudflare',
  envVars: [],
  status: 'STOPPED',
  uptimeSeconds: 0,
  createdAt: Date.now(),
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBootstrapReady, setIsBootstrapReady] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] = useState<BootstrapProgressEvent | null>(null);

  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [softwares, setSoftwares] = useState<SoftwareItem[]>(initialSoftwares);
  const [installingPackageId, setInstallingPackageId] = useState<string | null>(null);
  const [packageInstallProgress, setPackageInstallProgress] = useState<PackageProgressEvent | null>(null);

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [localIpAddress, setLocalIpAddress] = useState<string>('127.0.0.1');

  const uptimeTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || emptyFallbackProject;
  const activeStack = SUPPORTED_STACKS.find((s) => s.id === activeProject.stackId) || SUPPORTED_STACKS[0];

  const totalStorageMb = softwares
    .filter((s) => s.isInstalled)
    .reduce((sum, s) => sum + s.sizeMb, 0);

  const addLog = useCallback(
    (
      text: string,
      channel: 'stdout' | 'stderr' | 'system' = 'stdout',
      sessionId: string = 'runtime',
      projectId?: string,
      projectName?: string
    ) => {
      const newLine: LogLine = {
        id: Math.random().toString(36).substring(2, 9),
        sessionId,
        projectId,
        projectName,
        channel,
        text,
        timestamp: Date.now(),
      };
      setLogs((prev) => [...prev.slice(-500), newLine]);
    },
    []
  );

  const clearLogs = useCallback((projectId?: string) => {
    if (projectId) {
      setLogs((prev) => prev.filter((l) => l.projectId !== projectId));
    } else {
      setLogs([]);
    }
  }, []);

  const refreshLocalIp = useCallback(async () => {
    try {
      const ip = await NativeNetworkInspector.getLocalIpAddress();
      if (ip && ip !== '127.0.0.1') {
        setLocalIpAddress(ip);
      }
    } catch (_: any) {}
  }, []);

  // Real detection of software installed on disk
  const refreshSoftwareStatuses = useCallback(async () => {
    try {
      const statuses = await NativePRootBootstrap.getPackageStatuses();
      if (statuses) {
        setSoftwares((prev) =>
          prev.map((item) => {
            const diskInfo = statuses[item.id];
            if (diskInfo) {
              return {
                ...item,
                isInstalled: diskInfo.isInstalled,
                sizeMb: diskInfo.isInstalled ? diskInfo.sizeMb : item.sizeMb,
                path: diskInfo.path || item.path,
                version: diskInfo.version || item.version,
              };
            }
            return item;
          })
        );
      }
    } catch (e: any) {
      console.warn('Failed to query package statuses:', e);
    }
  }, []);

  // Update a project's fields
  const updateProject = useCallback((id: string, updates: Partial<ProjectItem>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  // Create a new project and write real files to disk
  const createProject = useCallback(async (stackId: TechStackId, name?: string): Promise<ProjectItem> => {
    const stack = SUPPORTED_STACKS.find((s) => s.id === stackId) || SUPPORTED_STACKS[0];
    const newProjCount = projects.filter((p) => p.stackId === stackId).length + 1;
    const projName = name || `${stack.name} ${newProjCount}`;
    const newPort = 3000 + projects.length * 100;
    const projectId = `proj-${Date.now().toString(36)}`;

    const newProject: ProjectItem = {
      id: projectId,
      name: projName,
      stackId,
      port: newPort,
      entryFile: stack.defaultEntry,
      startCommand: stack.defaultCommand,
      sourceType: 'STARTER_TEMPLATE',
      publicUrlType: 'cloudflare',
      envVars: [
        { key: 'PORT', value: newPort.toString() },
        { key: 'NODE_ENV', value: 'production' },
      ],
      status: 'STOPPED',
      uptimeSeconds: 0,
      createdAt: Date.now(),
    };

    // Write real starter template files into Android internal storage
    try {
      const starterFiles = getStarterFiles(stackId, newPort);
      const filesMap: Record<string, string> = {};
      starterFiles.forEach((f) => {
        filesMap[f.name] = f.content;
      });
      await NativePRootBootstrap.writeProjectFiles(projectId, filesMap);
      addLog(`[Project Created] Initialized ${projName} with starter code.`, 'system', 'setup', projectId, projName);
    } catch (e: any) {
      addLog(`[Warning] Could not write starter files: ${e.message}`, 'stderr', 'setup', projectId, projName);
    }

    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(projectId);
    return newProject;
  }, [projects, addLog]);

  // Delete project
  const deleteProject = useCallback(async (id: string) => {
    if (uptimeTimersRef.current[id]) {
      clearInterval(uptimeTimersRef.current[id]);
      delete uptimeTimersRef.current[id];
    }
    try {
      await NativePRootBootstrap.deleteProjectDir(id);
    } catch (_: any) {}
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Genuine package uninstallation
  const uninstallSoftware = useCallback(async (id: string) => {
    const item = softwares.find((s) => s.id === id);
    if (!item) return;

    try {
      addLog(`[Package Manager] Uninstalling ${item.name}...`, 'system');
      await NativePRootBootstrap.uninstallPackage(id);
      addLog(`[Package Manager] Removed ${item.name}.`, 'system');
      await refreshSoftwareStatuses();
    } catch (e: any) {
      addLog(`[Error] Failed to uninstall ${item.name}: ${e.message}`, 'stderr');
    }
  }, [softwares, addLog, refreshSoftwareStatuses]);

  // Genuine package download and installation
  const installSoftware = useCallback(async (id: string) => {
    const item = softwares.find((s) => s.id === id);
    if (!item) return;

    try {
      setInstallingPackageId(id);
      addLog(`[Package Manager] Starting download for ${item.name}...`, 'system');
      await NativePRootBootstrap.installPackage(id);
      addLog(`[Package Manager] ${item.name} successfully installed and ready!`, 'system');
      await refreshSoftwareStatuses();
    } catch (e: any) {
      addLog(`[Error] Installation of ${item.name} failed: ${e.message}`, 'stderr');
    } finally {
      setInstallingPackageId(null);
      setPackageInstallProgress(null);
    }
  }, [softwares, addLog, refreshSoftwareStatuses]);

  const cleanCache = useCallback(async () => {
    try {
      addLog('[Storage] Purging temporary caches...', 'system');
      const freedMb = await NativePRootBootstrap.cleanCache();
      setLogs([]);
      addLog(`[Storage] Cache purge complete. Freed ${freedMb.toFixed(1)} MB.`, 'system');
      await refreshSoftwareStatuses();
    } catch (e: any) {
      addLog(`[Storage Error] ${e.message}`, 'stderr');
    }
  }, [addLog, refreshSoftwareStatuses]);

  // Start specific project
  const startProject = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    try {
      updateProject(id, { status: 'BUILDING' });
      addLog(`[PocketHost] Starting build for ${project.name}...`, 'system', 'build', id, project.name);

      await NativeNetworkInspector.startForegroundService(
        `PocketHost: ${project.name}`,
        `Running on port ${project.port} • ${project.publicUrlType.toUpperCase()}`
      );

      const sessionId = `srv-${project.stackId}-${Date.now().toString(36)}`;
      const command = await NativePRootBootstrap.getExecutionCommand(project.startCommand);

      const envMap: Record<string, string> = {
        PORT: project.port.toString(),
        NODE_ENV: 'production',
      };
      project.envVars.forEach((v) => {
        if (v.key) envMap[v.key] = v.value;
      });

      await NativeProcessManager.createSession(
        sessionId,
        command,
        undefined,
        envMap,
        'RUNTIME_SERVER'
      );
      await NativeProcessManager.startSession(sessionId);

      // Determine public / local URL
      let activeUrl = `http://${localIpAddress}:${project.port}`;
      if (project.publicUrlType === 'cloudflare') {
        const cfInstalled = softwares.find((s) => s.id === 'cloudflared')?.isInstalled;
        if (!cfInstalled) {
          addLog('[Tunnel Warning] Cloudflare binary not installed. Please install it in Packages.', 'stderr', 'tunnel', id, project.name);
        }
        try {
          const cfRes = await NativeTunnelManager.startTunnel('cloudflare', project.port);
          if (cfRes.url) {
            activeUrl = cfRes.url;
            addLog(`[Tunnel] Cloudflare HTTPS: ${activeUrl}`, 'system', 'tunnel', id, project.name);
          }
        } catch (tErr: any) {
          addLog(`[Tunnel Error] ${tErr.message}`, 'stderr', 'tunnel', id, project.name);
        }
      } else if (project.publicUrlType === 'zrok') {
        try {
          const zrokRes = await NativeTunnelManager.startTunnel('zrok', project.port);
          if (zrokRes.url) {
            activeUrl = zrokRes.url;
            addLog(`[Tunnel] zrok Peer Tunnel: ${activeUrl}`, 'system', 'tunnel', id, project.name);
          }
        } catch (tErr: any) {
          addLog(`[Tunnel Error] ${tErr.message}`, 'stderr', 'tunnel', id, project.name);
        }
      } else {
        addLog(`[Local] Bound to Wi-Fi LAN: ${activeUrl}`, 'system', 'network', id, project.name);
      }

      updateProject(id, {
        status: 'RUNNING',
        activeUrl,
        activeSessionId: sessionId,
        uptimeSeconds: 0,
      });

      addLog(`[PocketHost] ${project.name} is LIVE on ${activeUrl}`, 'system', sessionId, id, project.name);

      if (uptimeTimersRef.current[id]) clearInterval(uptimeTimersRef.current[id]);
      uptimeTimersRef.current[id] = setInterval(() => {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, uptimeSeconds: p.uptimeSeconds + 1 } : p
          )
        );
      }, 1000);
    } catch (e: any) {
      addLog(`[Error] Failed to start ${project.name}: ${e.message}`, 'stderr', 'error', id, project.name);
      updateProject(id, { status: 'FAILED' });
    }
  }, [projects, localIpAddress, softwares, addLog, updateProject]);

  // Stop specific project
  const stopProject = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    try {
      addLog(`[PocketHost] Stopping ${project.name}...`, 'system', 'runtime', id, project.name);
      if (uptimeTimersRef.current[id]) {
        clearInterval(uptimeTimersRef.current[id]);
        delete uptimeTimersRef.current[id];
      }

      if (project.activeSessionId) {
        await NativeProcessManager.terminateSession(project.activeSessionId, false);
      }
      if (project.publicUrlType === 'cloudflare') {
        await NativeTunnelManager.stopTunnel('cloudflare');
      } else if (project.publicUrlType === 'zrok') {
        await NativeTunnelManager.stopTunnel('zrok');
      }

      const otherRunning = projects.some((p) => p.id !== id && p.status === 'RUNNING');
      if (!otherRunning) {
        await NativeNetworkInspector.stopForegroundService();
      }

      updateProject(id, {
        status: 'STOPPED',
        activeUrl: undefined,
        activeSessionId: undefined,
      });
      addLog(`[PocketHost] ${project.name} stopped.`, 'system', 'runtime', id, project.name);
    } catch (e: any) {
      addLog(`[Error] Stop error on ${project.name}: ${e.message}`, 'stderr', 'error', id, project.name);
    }
  }, [projects, addLog, updateProject]);

  const restartProject = useCallback(async (id: string) => {
    await stopProject(id);
    setTimeout(async () => {
      await startProject(id);
    }, 800);
  }, [stopProject, startProject]);

  const startDeployment = () => startProject(activeProject.id);
  const stopDeployment = () => stopProject(activeProject.id);
  const restartDeployment = () => restartProject(activeProject.id);

  const updateProjectConfig = (updates: Partial<ProjectConfig>) => {
    if (activeProject.id) {
      updateProject(activeProject.id, updates);
    }
  };

  const setActiveStack = (stack: TechStack) => {
    if (activeProject.id) {
      updateProject(activeProject.id, {
        stackId: stack.id,
        port: stack.defaultPort,
        entryFile: stack.defaultEntry,
        startCommand: stack.defaultCommand,
      });
    }
  };

  const deploymentState: DeploymentState = {
    status: activeProject.status,
    uptimeSeconds: activeProject.uptimeSeconds,
    localWifiUrl: `http://${localIpAddress}:${activeProject.port}`,
    cloudflareUrl: activeProject.publicUrlType === 'cloudflare' ? activeProject.activeUrl : undefined,
    zrokUrl: activeProject.publicUrlType === 'zrok' ? activeProject.activeUrl : undefined,
    activeSessionId: activeProject.activeSessionId,
  };

  const initializeBootstrap = async () => {
    try {
      addLog('[Setup] Initializing runtime environment...', 'system');
      await NativePRootBootstrap.initializeEnvironment((progress) => {
        setBootstrapProgress(progress);
      });
      setIsBootstrapReady(true);
      setBootstrapProgress(null);
      await refreshSoftwareStatuses();
      addLog('[Setup] Environment ready.', 'system');
    } catch (e: any) {
      addLog(`[Setup Error] ${e.message}`, 'stderr');
    }
  };

  const sendStdin = async (input: string) => {
    if (activeProject.activeSessionId) {
      await NativeProcessManager.writeStdin(activeProject.activeSessionId, input);
    }
  };

  const requestBatteryExemption = async () => {
    await NativeNetworkInspector.requestIgnoreBatteryOptimizations();
  };

  useEffect(() => {
    refreshLocalIp();
    refreshSoftwareStatuses();

    const sub = NativePRootBootstrap.onPackageProgress((event) => {
      setPackageInstallProgress(event);
      if (event.status === 'INSTALLED' || event.status === 'FAILED') {
        setInstallingPackageId(null);
        refreshSoftwareStatuses();
      }
    });

    return () => sub.remove();
  }, [refreshLocalIp, refreshSoftwareStatuses]);

  return (
    <AppContext.Provider
      value={{
        isBootstrapReady,
        bootstrapProgress,
        initializeBootstrap,
        projects,
        activeProjectId,
        setActiveProjectId,
        activeProject,
        startProject,
        stopProject,
        restartProject,
        createProject,
        updateProject,
        deleteProject,
        softwares,
        installingPackageId,
        packageInstallProgress,
        refreshSoftwareStatuses,
        uninstallSoftware,
        installSoftware,
        cleanCache,
        totalStorageMb,
        activeStack,
        setActiveStack,
        projectConfig: activeProject,
        updateProjectConfig,
        deploymentState,
        startDeployment,
        stopDeployment,
        restartDeployment,
        logs,
        addLog,
        clearLogs,
        sendStdin,
        localIpAddress,
        refreshLocalIp,
        requestBatteryExemption,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
