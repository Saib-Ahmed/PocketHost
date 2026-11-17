import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme/colors';
import { AppProvider, useApp } from './store/AppContext';
import { Header } from './components/Header';
import { TabBar, TabKey } from './components/TabBar';
import { StackSelectionScreen } from './screens/StackSelectionScreen';
import { DependencySetupScreen } from './screens/DependencySetupScreen';
import { ProjectConfigScreen } from './screens/ProjectConfigScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { TerminalLogScreen } from './screens/TerminalLogScreen';
import { DatabaseConfigScreen } from './screens/DatabaseConfigScreen';
import { ResourceMetricsScreen } from './screens/ResourceMetricsScreen';
import { TechStackId } from './types/stack';

const MainNavigator: React.FC = () => {
  const {
    deploymentState,
    activeProject,
    projects,
    requestBatteryExemption,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedStackId, setSelectedStackId] = useState<TechStackId | undefined>(undefined);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);

  const runningCount = projects.filter((p) => p.status === 'RUNNING').length;

  const renderContent = () => {
    if (showSetupModal) {
      return (
        <DependencySetupScreen
          onSetupComplete={() => {
            setShowSetupModal(false);
            setActiveTab('dashboard');
          }}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardScreen
            onOpenTerminal={() => setActiveTab('terminal')}
            onOpenConfig={(projectId) => {
              if (projectId) setSelectedProjectId(projectId);
              setActiveTab('config');
            }}
            onOpenStacks={(stackId) => {
              if (stackId) setSelectedStackId(stackId);
              setActiveTab('stacks');
            }}
          />
        );
      case 'stacks':
        return (
          <StackSelectionScreen
            initialStackId={selectedStackId}
            onStackChosen={() => setActiveTab('dashboard')}
            onOpenConfig={(projectId) => {
              setSelectedProjectId(projectId);
              setActiveTab('config');
            }}
          />
        );
      case 'resources':
        return <ResourceMetricsScreen />;
      case 'terminal':
        return <TerminalLogScreen />;
      case 'database':
        return <DatabaseConfigScreen />;
      case 'config':
        return (
          <ProjectConfigScreen
            selectedProjectId={selectedProjectId}
            onSaved={() => setActiveTab('dashboard')}
          />
        );
      default:
        return (
          <DashboardScreen
            onOpenTerminal={() => setActiveTab('terminal')}
            onOpenConfig={() => setActiveTab('config')}
            onOpenStacks={() => setActiveTab('stacks')}
          />
        );
    }
  };

  return (
    <View style={styles.root}>
      <Header
        title="PocketHost"
        subtitle={
          runningCount > 0
            ? `${runningCount} Services Active`
            : 'Mobile Hosting Engine'
        }
        isRunning={runningCount > 0}
        onBatteryOptPress={requestBatteryExemption}
      />

      <View style={styles.content}>{renderContent()}</View>

      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setShowSetupModal(false);
          setActiveTab(tab);
        }}
      />
    </View>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainNavigator />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});
