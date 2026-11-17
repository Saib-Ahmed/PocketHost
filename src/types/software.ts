export interface SoftwareItem {
  id: string;
  name: string;
  category: 'runtime' | 'tunnel' | 'tool' | 'core';
  version: string;
  sizeMb: number;
  icon: string;
  isInstalled: boolean;
  isCore?: boolean;
  path: string;
  description: string;
}
