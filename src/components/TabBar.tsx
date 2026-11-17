import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';
import {
  IconHome,
  IconStacks,
  IconMetrics,
  IconTerminal,
  IconDatabase,
  IconSettings,
} from './Icons';

export type TabKey = 'dashboard' | 'stacks' | 'resources' | 'terminal' | 'database' | 'config';

interface TabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  unreadLogsCount?: number;
}

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onTabChange,
  unreadLogsCount = 0,
}) => {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'dashboard', label: 'Home' },
    { key: 'stacks', label: 'Stacks' },
    { key: 'resources', label: 'Metrics' },
    { key: 'terminal', label: 'Logs' },
    { key: 'database', label: 'Database' },
    { key: 'config', label: 'Settings' },
  ];

  const renderIcon = (key: TabKey, isActive: boolean) => {
    const iconColor = isActive ? '#A5B4FC' : colors.textMuted;
    switch (key) {
      case 'dashboard':
        return <IconHome size={18} color={iconColor} />;
      case 'stacks':
        return <IconStacks size={18} color={iconColor} />;
      case 'resources':
        return <IconMetrics size={18} color={iconColor} />;
      case 'terminal':
        return <IconTerminal size={18} color={iconColor} />;
      case 'database':
        return <IconDatabase size={18} color={iconColor} />;
      case 'config':
        return <IconSettings size={18} color={iconColor} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.innerRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.activeTabItem]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrapper, isActive && styles.iconWrapperActive]}>
                {renderIcon(tab.key, isActive)}
                {tab.key === 'terminal' && unreadLogsCount > 0 && !isActive && (
                  <View style={styles.badgeDot} />
                )}
              </View>
              <Text
                style={[styles.label, isActive && styles.activeLabel]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.activePillIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    // Fix navigation bar overlapping on Android (gesture bar / 3-button bar)
    paddingBottom: Platform.OS === 'android' ? 24 : 14,
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 16,
  },
  innerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 1,
    position: 'relative',
  },
  activeTabItem: {
    backgroundColor: 'transparent',
  },
  iconWrapper: {
    width: 32,
    height: 26,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 2,
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
  },
  badgeDot: {
    position: 'absolute',
    top: 1,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  activeLabel: {
    color: '#A5B4FC',
    fontWeight: '700',
  },
  activePillIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
});
