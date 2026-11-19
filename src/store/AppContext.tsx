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
  executeTerminalCommand: (command: string, projectId?: string) => Promise<void>;
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
    sizeMb: 37.8,
    icon: 'CF',
    isInstalled: false,
    path: '/data/app/.../libcloudflared.so',
    description: 'Official Cloudflare daemon exposing local ports to the internet over free *.trycloudflare.com HTTPS.',
  },
  {
    id: 'nodejs',
    name: 'Node.js & npm',
    category: 'runtime',
    version: 'v20.15.1 (Alpine Linux)',
    sizeMb: 75.0,
    icon: 'JS',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/node',
    description: 'JavaScript runtime & npm package manager for running backend APIs and fullstack applications.',
  },
  {
    id: 'python',
    name: 'Python 3 & pip',
    category: 'runtime',
    version: 'Python 3.12 (Alpine Linux)',
    sizeMb: 60.0,
    icon: 'PY',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/python3',
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
    version: 'Git (Alpine Linux)',
    sizeMb: 25.0,
    icon: 'GIT',
    isInstalled: false,
    path: '/data/data/com.pockethost/files/rootfs/usr/bin/git',
    description: 'Source control tool for cloning repositories directly from GitHub and GitLab.',
  },
  {
    id: 'proot',
    name: 'PRoot Linux Core',
    category: 'core',
    version: 'v5.5.0 (ARM64 ptrace)',
    sizeMb: 4.1,
    icon: 'CORE',
    isInstalled: false,
    isCore: true,
    path: '/data/app/.../libproot.so',
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
      setLogs((prev) => [...prev.slice(-1000), newLine]);
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
      addLog(`[Package Manager] Starting installation of ${item.name}...`, 'system');
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

  // Render/Vercel Lifecycle: Pre-flight check -> Build -> Run daemon -> Cloudflare Quick Tunnel
  const startProject = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    try {
      updateProject(id, { status: 'BUILDING', activeUrl: undefined });
      addLog(`==> Deploying service: ${project.name}`, 'system', 'build', id, project.name);

      const envInfo = await NativePRootBootstrap.getEnvironmentInfo();
      const projectWorkspace = `${envInfo.projectsDir}/${project.id}`;

      // 1. Runtime Prerequisite Verification
      const isNodeBased = project.stackId.includes('node') || project.stackId.includes('next') || project.stackId.includes('react');
      const isPythonBased = project.stackId.includes('python');

      if (isNodeBased) {
        addLog(`==> Checking Node.js runtime...`, 'system', 'build', id, project.name);
        let nodeCheck = await NativePRootBootstrap.executeShellCommand('node -v', projectWorkspace);
        if (nodeCheck.exitCode !== 0 || !nodeCheck.stdout.trim().startsWith('v')) {
          addLog(`==> Node.js not detected in Linux container. Provisioning Node.js & npm...`, 'system', 'build', id, project.name);
          try {
            await installSoftware('nodejs');
            nodeCheck = await NativePRootBootstrap.executeShellCommand('node -v', projectWorkspace);
          } catch (instErr: any) {
            addLog(`[Build Error] Failed to auto-provision Node.js: ${instErr.message}`, 'stderr', 'build', id, project.name);
          }
          if (nodeCheck.exitCode !== 0 || !nodeCheck.stdout.trim().startsWith('v')) {
            addLog(`[Build Error] Node.js is not installed on this device.`, 'stderr', 'build', id, project.name);
            addLog(`[Build Error] Please open "Packages & Storage" tab and tap "Install" next to Node.js & npm.`, 'stderr', 'build', id, project.name);
            updateProject(id, { status: 'FAILED' });
            return;
          }
        }
        addLog(`==> Using Node.js ${nodeCheck.stdout.trim()}`, 'system', 'build', id, project.name);
      } else if (isPythonBased) {
        addLog(`==> Checking Python 3 runtime...`, 'system', 'build', id, project.name);
        let pyCheck = await NativePRootBootstrap.executeShellCommand('python3 --version', projectWorkspace);
        if (pyCheck.exitCode !== 0) {
          addLog(`==> Python 3 not detected in Linux container. Provisioning Python 3 & pip...`, 'system', 'build', id, project.name);
          try {
            await installSoftware('python');
            pyCheck = await NativePRootBootstrap.executeShellCommand('python3 --version', projectWorkspace);
          } catch (instErr: any) {
            addLog(`[Build Error] Failed to auto-provision Python: ${instErr.message}`, 'stderr', 'build', id, project.name);
          }
          if (pyCheck.exitCode !== 0) {
            addLog(`[Build Error] Python 3 is not installed on this device.`, 'stderr', 'build', id, project.name);
            addLog(`[Build Error] Please open "Packages & Storage" tab and tap "Install" next to Python 3.`, 'stderr', 'build', id, project.name);
            updateProject(id, { status: 'FAILED' });
            return;
          }
        }
        addLog(`==> Using ${pyCheck.stdout.trim()}`, 'system', 'build', id, project.name);
      }

      // 2. Build & Dependency Resolution Phase
      addLog(`==> Inspecting project directory...`, 'system', 'build', id, project.name);
      const lsCheck = await NativePRootBootstrap.executeShellCommand('ls -la', projectWorkspace);
      if (lsCheck.exitCode !== 0) {
        addLog(`[Build Error] Project workspace does not exist.`, 'stderr', 'build', id, project.name);
        updateProject(id, { status: 'FAILED' });
        return;
      }

      let detectedStartCommand = project.startCommand;

      if (isNodeBased) {
        const pkgCheck = await NativePRootBootstrap.executeShellCommand('[ -f package.json ] && echo "FOUND"', projectWorkspace);
        if (pkgCheck.stdout.trim() === 'FOUND') {
          // Parse package.json for Next.js, Prisma, and build scripts
          const catPkg = await NativePRootBootstrap.executeShellCommand('cat package.json', projectWorkspace);
          let isNext = false;
          let isPrisma = false;
          let hasBuildScript = false;

          try {
            const pkgData = JSON.parse(catPkg.stdout.trim());
            const allDeps = { ...(pkgData.dependencies || {}), ...(pkgData.devDependencies || {}) };
            isNext = 'next' in allDeps;
            isPrisma = 'prisma' in allDeps || '@prisma/client' in allDeps;
            hasBuildScript = Boolean(pkgData.scripts?.build);
          } catch (_: any) {}

          // 2a. Install dependencies via npm
          const nmCheck = await NativePRootBootstrap.executeShellCommand('[ -d node_modules ] && echo "EXISTS"', projectWorkspace);
          if (nmCheck.stdout.trim() !== 'EXISTS') {
            addLog(`==> package.json detected. Installing dependencies via npm...`, 'system', 'build', id, project.name);
            const npmRes = await NativePRootBootstrap.executeShellCommand('npm install --prefer-offline --no-audit', projectWorkspace);
            if (npmRes.stdout) {
              npmRes.stdout.split('\n').filter(Boolean).forEach((line) => addLog(line, 'stdout', 'build', id, project.name));
            }
            if (npmRes.stderr) {
              npmRes.stderr.split('\n').filter(Boolean).forEach((line) => addLog(line, 'stderr', 'build', id, project.name));
            }
            if (npmRes.exitCode !== 0) {
              addLog(`[Build Failed] npm install failed with exit code ${npmRes.exitCode}`, 'stderr', 'build', id, project.name);
              updateProject(id, { status: 'FAILED' });
              return;
            }
          }

          // 2b. Prisma Client Generation if present
          if (isPrisma) {
            const prismaSchemaCheck = await NativePRootBootstrap.executeShellCommand('[ -f prisma/schema.prisma ] && echo "FOUND"', projectWorkspace);
            if (prismaSchemaCheck.stdout.trim() === 'FOUND') {
              addLog(`==> Prisma schema detected. Running 'npx prisma generate'...`, 'system', 'build', id, project.name);
              const prismaRes = await NativePRootBootstrap.executeShellCommand('npx prisma generate', projectWorkspace);
              if (prismaRes.stdout) prismaRes.stdout.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stdout', 'build', id, project.name));
              if (prismaRes.stderr) prismaRes.stderr.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stderr', 'build', id, project.name));
            }
          }

          // 2c. Next.js / Frontend Build Step
          if (isNext) {
            addLog(`==> Next.js project detected.`, 'system', 'build', id, project.name);
            if (hasBuildScript) {
              addLog(`==> Compiling Next.js: running 'npm run build'...`, 'system', 'build', id, project.name);
              const buildRes = await NativePRootBootstrap.executeShellCommand('npm run build', projectWorkspace);
              if (buildRes.stdout) buildRes.stdout.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stdout', 'build', id, project.name));
              if (buildRes.stderr) buildRes.stderr.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stderr', 'build', id, project.name));
              if (buildRes.exitCode !== 0) {
                addLog(`[Build Failed] Next.js compilation failed with exit code ${buildRes.exitCode}. See errors above.`, 'stderr', 'build', id, project.name);
                updateProject(id, { status: 'FAILED' });
                return;
              }
            }
            if (detectedStartCommand === 'node server.js' || !detectedStartCommand) {
              detectedStartCommand = `npx next start -p ${project.port} -H 0.0.0.0`;
            }
          } else if (hasBuildScript && (project.stackId.includes('react') || project.stackId.includes('next'))) {
            addLog(`==> Executing build script: 'npm run build'...`, 'system', 'build', id, project.name);
            const buildRes = await NativePRootBootstrap.executeShellCommand('npm run build', projectWorkspace);
            if (buildRes.stdout) buildRes.stdout.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stdout', 'build', id, project.name));
            if (buildRes.stderr) buildRes.stderr.split('\n').filter(Boolean).forEach((l) => addLog(l, 'stderr', 'build', id, project.name));
          }
        }
      } else if (isPythonBased) {
        const reqCheck = await NativePRootBootstrap.executeShellCommand('[ -f requirements.txt ] && echo "FOUND"', projectWorkspace);
        if (reqCheck.stdout.trim() === 'FOUND') {
          addLog(`==> requirements.txt detected. Installing Python dependencies...`, 'system', 'build', id, project.name);
          const pipRes = await NativePRootBootstrap.executeShellCommand('pip install --no-cache-dir -r requirements.txt', projectWorkspace);
          if (pipRes.stdout) {
            pipRes.stdout.split('\n').filter(Boolean).forEach((line) => addLog(line, 'stdout', 'build', id, project.name));
          }
          if (pipRes.stderr) {
            pipRes.stderr.split('\n').filter(Boolean).forEach((line) => addLog(line, 'stderr', 'build', id, project.name));
          }
          if (pipRes.exitCode !== 0) {
            addLog(`[Build Failed] pip install failed with exit code ${pipRes.exitCode}`, 'stderr', 'build', id, project.name);
            updateProject(id, { status: 'FAILED' });
            return;
          }
        }

        // FastAPI / Uvicorn auto-detection
        const mainPyCheck = await NativePRootBootstrap.executeShellCommand('[ -f main.py ] && echo "MAIN" || ([ -f app.py ] && echo "APP")', projectWorkspace);
        const pyEntry = mainPyCheck.stdout.trim() === 'MAIN' ? 'main' : (mainPyCheck.stdout.trim() === 'APP' ? 'app' : null);
        if (pyEntry) {
          const contentCheck = await NativePRootBootstrap.executeShellCommand(`grep -i "FastAPI" ${pyEntry}.py 2>/dev/null && echo "IS_FASTAPI"`, projectWorkspace);
          if (contentCheck.stdout.includes('IS_FASTAPI')) {
            addLog(`==> FastAPI ASGI service detected in ${pyEntry}.py`, 'system', 'build', id, project.name);
            if (detectedStartCommand === 'python main.py' || !detectedStartCommand) {
              detectedStartCommand = `python3 -m uvicorn ${pyEntry}:app --host 0.0.0.0 --port ${project.port}`;
            }
          }
        }
      }

      // Verify entry file exists if specified
      if (project.entryFile && !project.entryFile.includes('next')) {
        const entryCheck = await NativePRootBootstrap.executeShellCommand(`[ -f "${project.entryFile}" ] && echo "EXISTS"`, projectWorkspace);
        const hasPackageJson = (await NativePRootBootstrap.executeShellCommand('[ -f package.json ] && echo "YES"', projectWorkspace)).stdout.trim() === 'YES';
        if (entryCheck.stdout.trim() !== 'EXISTS' && !hasPackageJson) {
          addLog(`[Build Error] Entry file '${project.entryFile}' was not found in project workspace.`, 'stderr', 'build', id, project.name);
          updateProject(id, { status: 'FAILED' });
          return;
        }
      }

      // 3. Start Phase - Run Real Daemon inside PRoot
      addLog(`==> Starting runtime service: ${detectedStartCommand}`, 'system', 'runtime', id, project.name);
      await NativeNetworkInspector.startForegroundService(
        `PocketHost: ${project.name}`,
        `Port ${project.port} • ${project.publicUrlType.toUpperCase()}`
      );

      const sessionId = `srv-${project.id}`;
      const envMap: Record<string, string> = {
        PORT: project.port.toString(),
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
      };
      project.envVars.forEach((v) => {
        if (v.key) envMap[v.key] = v.value;
      });

      const commandParts = detectedStartCommand.split(/\s+/).filter(Boolean);

      await NativeProcessManager.createSession(
        sessionId,
        commandParts,
        projectWorkspace,
        envMap,
        'RUNTIME_SERVER'
      );
      await NativeProcessManager.startSession(sessionId);

      addLog(`==> Daemon process running on 0.0.0.0:${project.port}`, 'system', sessionId, id, project.name);

      // 4. Cloudflare Quick Tunnel Phase
      let activeUrl: string | undefined = undefined;
      if (project.publicUrlType === 'cloudflare') {
        addLog(`==> Establishing Cloudflare Quick Tunnel on port ${project.port}...`, 'system', 'tunnel', id, project.name);
        try {
          const cfRes = await NativeTunnelManager.startTunnel('cloudflare', project.port);
          if (cfRes?.url && cfRes.url.includes('trycloudflare.com') && !cfRes.url.includes('api.trycloudflare.com')) {
            activeUrl = cfRes.url;
            addLog(`==> Cloudflare Tunnel Live: ${activeUrl}`, 'system', 'tunnel', id, project.name);
          } else {
            addLog(`[Cloudflare Error] Cloudflare Edge tunnel timed out.`, 'stderr', 'tunnel', id, project.name);
          }
        } catch (tErr: any) {
          addLog(`[Cloudflare Error] ${tErr.message}`, 'stderr', 'tunnel', id, project.name);
        }
      } else if (project.publicUrlType === 'local') {
        activeUrl = `http://${localIpAddress}:${project.port}`;
        addLog(`==> Local Network Endpoint: ${activeUrl}`, 'system', 'network', id, project.name);
      }

      updateProject(id, {
        status: 'RUNNING',
        activeUrl,
        activeSessionId: sessionId,
        uptimeSeconds: 0,
      });

      if (uptimeTimersRef.current[id]) clearInterval(uptimeTimersRef.current[id]);
      uptimeTimersRef.current[id] = setInterval(() => {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, uptimeSeconds: p.uptimeSeconds + 1 } : p
          )
        );
      }, 1000);
    } catch (e: any) {
      addLog(`[Deployment Error] Failed to start ${project.name}: ${e.message}`, 'stderr', 'error', id, project.name);
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
      addLog('[Setup] Initializing PRoot Linux userland...', 'system');
      await NativePRootBootstrap.initializeEnvironment((progress) => {
        setBootstrapProgress(progress);
      });
      setIsBootstrapReady(true);
      setBootstrapProgress(null);
      await refreshSoftwareStatuses();
      addLog('[Setup] PRoot Linux userland ready.', 'system');
    } catch (e: any) {
      addLog(`[Setup Error] ${e.message}`, 'stderr');
    }
  };

  const sendStdin = async (input: string) => {
    if (activeProject.activeSessionId) {
      await NativeProcessManager.writeStdin(activeProject.activeSessionId, input);
    }
  };

  // Real shell command execution in Terminal
  const executeTerminalCommand = useCallback(async (command: string, projectId?: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    const targetProj = projectId ? projects.find((p) => p.id === projectId) : activeProject;
    const envInfo = await NativePRootBootstrap.getEnvironmentInfo();
    const workspace = targetProj?.id ? `${envInfo.projectsDir}/${targetProj.id}` : envInfo.rootDir;

    addLog(`$ ${trimmed}`, 'stdout', 'terminal', targetProj?.id, targetProj?.name);

    try {
      const res = await NativePRootBootstrap.executeShellCommand(trimmed, workspace);
      if (res.stdout) {
        res.stdout.split('\n').forEach((line) => {
          if (line) addLog(line, 'stdout', 'terminal', targetProj?.id, targetProj?.name);
        });
      }
      if (res.stderr) {
        res.stderr.split('\n').forEach((line) => {
          if (line) addLog(line, 'stderr', 'terminal', targetProj?.id, targetProj?.name);
        });
      }
      if (res.exitCode !== 0) {
        addLog(`[Process exited with code ${res.exitCode}]`, 'stderr', 'terminal', targetProj?.id, targetProj?.name);
      }
    } catch (e: any) {
      addLog(`[Error] Shell execution failed: ${e.message}`, 'stderr', 'terminal', targetProj?.id, targetProj?.name);
    }
  }, [projects, activeProject, addLog]);

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

    const tunnelSub = NativeTunnelManager.onUrlGenerated((event) => {
      if (event?.url && event.url.includes('trycloudflare.com')) {
        addLog(`[Cloudflare Quick Tunnel] Public HTTPS Live: ${event.url}`, 'system', 'tunnel');
        setProjects((prev) =>
          prev.map((p) =>
            p.status === 'RUNNING' && p.port === event.port
              ? { ...p, activeUrl: event.url }
              : p
          )
        );
      }
    });

    // Real Process Stdout / Stderr Stream
    const procOutputSub = NativeProcessManager.onOutput((event) => {
      if (event?.text) {
        const lines = event.text.split('\n');
        lines.forEach((line) => {
          if (line) {
            addLog(
              line,
              event.streamType === 'stderr' ? 'stderr' : 'stdout',
              event.sessionId
            );
          }
        });
      }
    });

    const procStatusSub = NativeProcessManager.onStatusChange((event) => {
      if (event?.sessionId) {
        if (event.status === 'FAILED' || event.status === 'STOPPED') {
          setProjects((prev) =>
            prev.map((p) =>
              p.activeSessionId === event.sessionId
                ? { ...p, status: event.status === 'FAILED' ? 'FAILED' : 'STOPPED' }
                : p
            )
          );
        }
      }
    });

    return () => {
      sub.remove();
      tunnelSub.remove();
      procOutputSub.remove();
      procStatusSub.remove();
    };
  }, [refreshLocalIp, refreshSoftwareStatuses, addLog]);

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
        executeTerminalCommand,
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
