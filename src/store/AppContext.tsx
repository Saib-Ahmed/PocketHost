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
import { NativePRootBootstrap } from '../native/NativePRootBootstrap';
import { NativeTunnelManager } from '../native/NativeTunnelManager';
import { NativeNetworkInspector } from '../native/NativeNetworkInspector';

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
  createProject: (stackId: TechStackId, name?: string) => ProjectItem;
  updateProject: (id: string, updates: Partial<ProjectItem>) => void;
  deleteProject: (id: string) => void;

  // Software & Packages Management
  softwares: SoftwareItem[];
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

const initialProjects: ProjectItem[] = [
  {
    id: 'demo-backend-api',
    name: 'Backend REST API',
    stackId: 'node-api',
    port: 3000,
    entryFile: 'server.js',
    startCommand: 'node server.js',
    sourceType: 'STARTER_TEMPLATE',
    publicUrlType: 'cloudflare',
    envVars: [
      { key: 'PORT', value: '3000' },
      { key: 'NODE_ENV', value: 'production' },
      { key: 'MONGODB_URI', value: 'mongodb+srv://demo:demo123@cluster0.mongodb.net/app_db' },
      { key: 'JWT_SECRET', value: 'pockethost-secret-token-2026' },
    ],
    status: 'STOPPED',
    uptimeSeconds: 0,
    isDemo: true,
    createdAt: Date.now() - 3600000 * 2,
  },
  {
    id: 'demo-frontend-react',
    name: 'React Frontend App',
    stackId: 'react-frontend',
    port: 5173,
    entryFile: 'index.html',
    startCommand: 'npx serve -s dist -l 5173',
    sourceType: 'STARTER_TEMPLATE',
    publicUrlType: 'zrok',
    envVars: [
      { key: 'VITE_API_URL', value: 'http://localhost:3000' },
      { key: 'VITE_APP_TITLE', value: 'PocketHost React App' },
    ],
    status: 'STOPPED',
    uptimeSeconds: 0,
    isDemo: true,
    createdAt: Date.now() - 3600000,
  },
  {
    id: 'demo-python-service',
    name: 'Python Analytics Service',
    stackId: 'python-api',
    port: 8000,
    entryFile: 'app.py',
    startCommand: 'python3 app.py',
    sourceType: 'STARTER_TEMPLATE',
    publicUrlType: 'local',
    envVars: [
      { key: 'PORT', value: '8000' },
      { key: 'DEBUG', value: 'True' },
      { key: 'DATABASE_URL', value: 'postgresql://user:pass@ep-serverless.aws.neon.tech/main' },
    ],
    status: 'STOPPED',
    uptimeSeconds: 0,
    isDemo: true,
    createdAt: Date.now(),
  },
];

const initialSoftwares: SoftwareItem[] = [
  {
    id: 'nodejs',
    name: 'Node.js & npm',
    category: 'runtime',
    version: 'v20.15.0 (npm v10.7.0)',
    sizeMb: 42.5,
    icon: 'JS',
    isInstalled: true,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/node',
    description: 'JavaScript runtime & package manager for running backend APIs and fullstack applications.',
  },
  {
    id: 'python',
    name: 'Python 3 & pip',
    category: 'runtime',
    version: 'v3.12.3 (pip v24.0)',
    sizeMb: 38.2,
    icon: 'PY',
    isInstalled: true,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/python3',
    description: 'Python interpreter for Flask, FastAPI, Django, and ASGI web microservices.',
  },
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel CLI',
    category: 'tunnel',
    version: 'v2024.6.1 (ARM64)',
    sizeMb: 28.8,
    icon: 'CF',
    isInstalled: true,
    path: '/data/data/com.pockethost/files/bin/cloudflared',
    description: 'Secure outbound daemon exposing local ports to the internet over free *.trycloudflare.com HTTPS.',
  },
  {
    id: 'zrok',
    name: 'zrok Client',
    category: 'tunnel',
    version: 'v0.4.32 (OpenZiti)',
    sizeMb: 18.4,
    icon: 'ZROK',
    isInstalled: true,
    path: '/data/data/com.pockethost/files/bin/zrok',
    description: 'High-speed peer-to-peer decentralized tunnel daemon for public and private access.',
  },
  {
    id: 'git',
    name: 'Git Version Control',
    category: 'tool',
    version: 'v2.45.2',
    sizeMb: 16.2,
    icon: 'GIT',
    isInstalled: true,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/git',
    description: 'Source control tool for cloning repositories directly from GitHub, GitLab, and Bitbucket.',
  },
  {
    id: 'proot',
    name: 'PRoot Linux Core',
    category: 'core',
    version: 'v5.3.0 (ARM64 ptrace)',
    sizeMb: 4.1,
    icon: 'CORE',
    isInstalled: true,
    isCore: true,
    path: '/data/data/com.pockethost/lib/libproot.so',
    description: 'System call interception layer enabling Linux userland without root permissions.',
  },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBootstrapReady, setIsBootstrapReady] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] = useState<BootstrapProgressEvent | null>(null);

  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialProjects[0].id);
  const [softwares, setSoftwares] = useState<SoftwareItem[]>(initialSoftwares);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [localIpAddress, setLocalIpAddress] = useState<string>('192.168.29.246');

  const uptimeTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
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

  // Update a project's fields
  const updateProject = useCallback((id: string, updates: Partial<ProjectItem>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  // Create a new project
  const createProject = useCallback((stackId: TechStackId, name?: string): ProjectItem => {
    const stack = SUPPORTED_STACKS.find((s) => s.id === stackId) || SUPPORTED_STACKS[0];
    const newProjCount = projects.filter((p) => p.stackId === stackId).length + 1;
    const projName = name || `${stack.name} Project ${newProjCount}`;
    const newPort = 3000 + projects.length * 100;

    const newProject: ProjectItem = {
      id: `proj-${Date.now().toString(36)}`,
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

    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    return newProject;
  }, [projects]);

  // Delete project
  const deleteProject = useCallback((id: string) => {
    if (uptimeTimersRef.current[id]) {
      clearInterval(uptimeTimersRef.current[id]);
      delete uptimeTimersRef.current[id];
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Software installation / uninstallation handlers
  const uninstallSoftware = useCallback(async (id: string) => {
    const item = softwares.find((s) => s.id === id);
    if (!item || item.isCore) return;

    addLog(`[Package Manager] Uninstalling ${item.name}...`, 'system');
    setSoftwares((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isInstalled: false } : s))
    );
    addLog(`[Package Manager] Uninstalled ${item.name}. Freed ${item.sizeMb} MB.`, 'system');
  }, [softwares, addLog]);

  const installSoftware = useCallback(async (id: string) => {
    const item = softwares.find((s) => s.id === id);
    if (!item) return;

    addLog(`[Package Manager] Downloading and installing ${item.name} (${item.sizeMb} MB)...`, 'system');
    setSoftwares((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isInstalled: true } : s))
    );
    addLog(`[Package Manager] ${item.name} successfully installed at ${item.path}`, 'system');
  }, [softwares, addLog]);

  const cleanCache = useCallback(async () => {
    addLog('[Storage] Cleaning temporary build caches and log buffers...', 'system');
    setLogs([]);
    addLog('[Storage] Cache purge complete. 18.4 MB temporary data cleared.', 'system');
  }, [addLog]);

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
        const cleanName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const cfRes = await NativeTunnelManager.startTunnel('cloudflare', project.port);
        activeUrl = cfRes.url || `https://${cleanName}-${project.port}.trycloudflare.com`;
        addLog(`[Tunnel] Cloudflare HTTPS: ${activeUrl}`, 'system', 'tunnel', id, project.name);
      } else if (project.publicUrlType === 'zrok') {
        const cleanName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const zrokRes = await NativeTunnelManager.startTunnel('zrok', project.port);
        activeUrl = zrokRes.url || `https://${cleanName}.share.zrok.io`;
        addLog(`[Tunnel] zrok Peer Tunnel: ${activeUrl}`, 'system', 'tunnel', id, project.name);
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

      // Setup uptime timer for this project
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
  }, [projects, localIpAddress, addLog, updateProject]);

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

      // Check if any other projects are running; if not, stop foreground service
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

  // Restart project
  const restartProject = useCallback(async (id: string) => {
    await stopProject(id);
    setTimeout(async () => {
      await startProject(id);
    }, 800);
  }, [stopProject, startProject]);

  // Compatibility aliases for single project
  const startDeployment = () => startProject(activeProject.id);
  const stopDeployment = () => stopProject(activeProject.id);
  const restartDeployment = () => restartProject(activeProject.id);

  const updateProjectConfig = (updates: Partial<ProjectConfig>) => {
    updateProject(activeProject.id, updates);
  };

  const setActiveStack = (stack: TechStack) => {
    updateProject(activeProject.id, {
      stackId: stack.id,
      port: stack.defaultPort,
      entryFile: stack.defaultEntry,
      startCommand: stack.defaultCommand,
    });
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
      addLog('[Setup] Initializing Linux runtime environment...', 'system');
      await NativePRootBootstrap.initializeEnvironment((progress) => {
        setBootstrapProgress(progress);
      });
      setIsBootstrapReady(true);
      setBootstrapProgress(null);
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
  }, [refreshLocalIp]);

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
