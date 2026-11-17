export type TechStackId = 'node-api' | 'python-api' | 'react-frontend' | 'nextjs' | 'mern' | 'custom';

export interface TechStack {
  id: TechStackId;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  badgeColor: string;
  defaultPort: number;
  defaultEntry: string;
  defaultCommand: string;
  requiredPackages: string[];
  supportsDatabase: boolean;
  isPopular?: boolean;
}

export const SUPPORTED_STACKS: TechStack[] = [
  {
    id: 'node-api',
    name: 'Node.js',
    tagline: 'Express / REST API',
    description: 'High-performance JavaScript backend with full npm package ecosystem.',
    icon: 'JS',
    badgeColor: '#22C55E',
    defaultPort: 3000,
    defaultEntry: 'server.js',
    defaultCommand: 'node server.js',
    requiredPackages: ['nodejs', 'npm'],
    supportsDatabase: true,
    isPopular: true,
  },
  {
    id: 'python-api',
    name: 'Python',
    tagline: 'FastAPI / Flask',
    description: 'Modern Python 3 web service with pip package management in Linux PRoot.',
    icon: 'PY',
    badgeColor: '#3B82F6',
    defaultPort: 8000,
    defaultEntry: 'app.py',
    defaultCommand: 'python3 app.py',
    requiredPackages: ['python3', 'python3-pip'],
    supportsDatabase: true,
    isPopular: true,
  },
  {
    id: 'react-frontend',
    name: 'Frontend React',
    tagline: 'React + Vite / SPA',
    description: 'Fast single-page React application served over local Wi-Fi and public tunnels.',
    icon: 'REACT',
    badgeColor: '#06B6D4',
    defaultPort: 5173,
    defaultEntry: 'index.html',
    defaultCommand: 'npx serve -s dist -l 5173',
    requiredPackages: ['nodejs', 'npm'],
    supportsDatabase: false,
    isPopular: true,
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    tagline: 'SSR / Fullstack App',
    description: 'Modern React server-side rendering and API routes on your Android phone.',
    icon: 'NEXT',
    badgeColor: '#EC4899',
    defaultPort: 3000,
    defaultEntry: 'server.js',
    defaultCommand: 'npx next start -p 3000',
    requiredPackages: ['nodejs', 'npm'],
    supportsDatabase: true,
    isPopular: true,
  },
  {
    id: 'mern',
    name: 'MERN Stack',
    tagline: 'Express + React + Mongo',
    description: 'Fullstack application with Node.js backend and cloud MongoDB Atlas.',
    icon: 'MERN',
    badgeColor: '#10B981',
    defaultPort: 5000,
    defaultEntry: 'server.js',
    defaultCommand: 'node server.js',
    requiredPackages: ['nodejs', 'npm'],
    supportsDatabase: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'PRoot Linux / Bash',
    description: 'Run arbitrary binaries, scripts, or custom web servers in isolated environment.',
    icon: 'BASH',
    badgeColor: '#8B5CF6',
    defaultPort: 4000,
    defaultEntry: 'main.sh',
    defaultCommand: 'node main.js',
    requiredPackages: ['nodejs'],
    supportsDatabase: true,
  },
];
