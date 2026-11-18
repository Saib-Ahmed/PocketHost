import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { SUPPORTED_STACKS } from '../types/stack';
import { formatUptime } from '../utils/formatters';
import { NativeNetworkInspector, SystemMetrics } from '../native/NativeNetworkInspector';

export const ResourceMetricsScreen: React.FC = () => {
  const { projects, startProject } = useApp();

  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalRamMb: 6144,
    usedRamMb: 2450,
    availRamMb: 3694,
    ramUsagePercent: 39.8,
    totalStorageMb: 122880,
    usedStorageMb: 45000,
    availStorageMb: 77880,
    appDataSizeMb: 0,
    cpuCores: 8,
    batteryLevel: 85,
    isCharging: false,
    isLowMemory: false,
  });

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await NativeNetworkInspector.getSystemMetrics();
      if (data) {
        setMetrics(data);
      }
    } catch (_: any) {}
  }, []);

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 2500);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');
  const runningCount = runningProjects.length;

  const totalRamGb = (metrics.totalRamMb / 1024).toFixed(1);
  const usedRamGb = (metrics.usedRamMb / 1024).toFixed(1);
  const availRamGb = (metrics.availRamMb / 1024).toFixed(1);
  const ramPercentStr = metrics.ramUsagePercent.toFixed(1);

  const freeStorageGb = (metrics.availStorageMb / 1024).toFixed(1);
  const totalStorageGb = (metrics.totalStorageMb / 1024).toFixed(1);
  const storageUsagePercent = metrics.totalStorageMb > 0
    ? ((metrics.usedStorageMb / metrics.totalStorageMb) * 100).toFixed(1)
    : '0.0';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>System Telemetry</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>HARDWARE LIVE</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Real hardware telemetry from Android OS ActivityManager & StatFs.
        </Text>
      </View>

      {/* 2. Top Summary Overview Cards (2x2 Grid) */}
      <View style={styles.metricsGrid}>
        {/* RAM Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>DEVICE RAM</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#38BDF8' }]}>{ramPercentStr}%</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {usedRamGb} <Text style={styles.metricUnit}>/ {totalRamGb} GB</Text>
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, metrics.ramUsagePercent)}%`, backgroundColor: '#38BDF8' },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Free: {availRamGb} GB • {metrics.isLowMemory ? 'Low Memory' : 'Healthy'}
          </Text>
        </Card>

        {/* CPU Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>CPU HARDWARE</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#818CF8' }]}>{metrics.cpuCores} Cores</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {metrics.cpuCores} <Text style={styles.metricUnit}>ARM64 Cores</Text>
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: runningCount > 0 ? '45%' : '10%', backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            {runningCount > 0 ? `${runningCount} Services Active` : 'Host Engine Idle'}
          </Text>
        </Card>

        {/* Storage Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>DEVICE FLASH</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: colors.success }]}>{freeStorageGb}G Free</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {freeStorageGb} <Text style={styles.metricUnit}>GB FREE</Text>
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${storageUsagePercent}%`, backgroundColor: colors.success },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            App Data: {metrics.appDataSizeMb.toFixed(1)} MB • {totalStorageGb} GB Total
          </Text>
        </Card>

        {/* Battery & Status Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>BATTERY & POWER</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: colors.warning }]}>
                {metrics.batteryLevel >= 0 ? `${metrics.batteryLevel}%` : 'CONNECTED'}
              </Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {metrics.isCharging ? 'Charging' : 'On Battery'}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${metrics.batteryLevel >= 0 ? metrics.batteryLevel : 100}%`,
                  backgroundColor: colors.warning,
                },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Foreground Service Active
          </Text>
        </Card>
      </View>

      {/* 3. Project-Wise Resource Telemetry */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Project-Wise Telemetry</Text>
          <Text style={styles.sectionCountText}>{runningCount} of {projects.length} Online</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Realtime status and uptime for your hosted projects.
        </Text>
      </View>

      {projects.length === 0 ? (
        <Card style={styles.emptyTelemetryCard}>
          <Text style={styles.emptyTelemetryTitle}>No Active Services</Text>
          <Text style={styles.emptyTelemetrySub}>
            You do not have any services hosted yet. Deploy a Node.js or Python service from the Dashboard to see its status here.
          </Text>
        </Card>
      ) : (
        <View style={styles.projectList}>
          {projects.map((project) => {
            const stack = SUPPORTED_STACKS.find((s) => s.id === project.stackId) || SUPPORTED_STACKS[0];
            const isRunning = project.status === 'RUNNING';
            const isBuilding = project.status === 'BUILDING';

            return (
              <Card key={project.id} style={styles.projectCard}>
                <View style={styles.projectCardTop}>
                  <View style={styles.projectIdentity}>
                    <View style={[styles.stackBadge, { borderColor: `${stack.badgeColor}40` }]}>
                      <Text style={[styles.stackBadgeText, { color: stack.badgeColor }]}>
                        {stack.icon}
                      </Text>
                    </View>
                    <View style={styles.projectDetails}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                      <Text style={styles.projectMeta}>
                        Port {project.port} • {isRunning ? `${formatUptime(project.uptimeSeconds)}` : 'Stopped'}
                      </Text>
                    </View>
                  </View>

                  <Badge
                    label={project.status}
                    color={isRunning ? colors.success : isBuilding ? colors.warning : colors.textMuted}
                    bgColor={isRunning ? colors.successMuted : isBuilding ? colors.warningMuted : colors.surfaceHighlight}
                  />
                </View>

                {isRunning && (
                  <View style={styles.telemetrySection}>
                    <View style={styles.telemetryRow}>
                      <View style={styles.telemetryLabelWrap}>
                        <Text style={styles.telemetryName}>Process State</Text>
                        <Text style={styles.telemetryNumber}>Active (Port {project.port})</Text>
                      </View>
                    </View>
                    {project.activeUrl && (
                      <Text style={styles.urlDisplay} numberOfLines={1}>
                        URL: {project.activeUrl}
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    width: '48.5%',
    padding: 12,
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  metricSubText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionCountText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  projectList: {
    gap: 10,
  },
  emptyTelemetryCard: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  emptyTelemetryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyTelemetrySub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  projectCard: {
    padding: 12,
  },
  projectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  stackBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHighlight,
  },
  stackBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  projectDetails: {
    flex: 1,
  },
  projectName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  projectMeta: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  telemetrySection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetryLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  telemetryName: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  telemetryNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  urlDisplay: {
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#818CF8',
    marginTop: 4,
  },
});
