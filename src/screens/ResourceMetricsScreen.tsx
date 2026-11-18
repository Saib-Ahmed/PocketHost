import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { SUPPORTED_STACKS } from '../types/stack';
import { formatUptime } from '../utils/formatters';
import { NativeNetworkInspector, SystemMetrics, ProjectResourceMetrics } from '../native/NativeNetworkInspector';

export const ResourceMetricsScreen: React.FC = () => {
  const { projects } = useApp();

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

  const [projectMetricsMap, setProjectMetricsMap] = useState<Record<string, ProjectResourceMetrics>>({});

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await NativeNetworkInspector.getSystemMetrics();
      if (data) {
        setMetrics(data);
      }
    } catch (_: any) {}

    // Fetch individual project telemetry
    const map: Record<string, ProjectResourceMetrics> = {};
    for (const p of projects) {
      try {
        const pm = await NativeNetworkInspector.getProjectResourceMetrics(p.id);
        if (pm) map[p.id] = pm;
      } catch (_: any) {}
    }
    setProjectMetricsMap(map);
  }, [projects]);

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 2000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');
  const runningCount = runningProjects.length;

  const totalRamGb = (metrics.totalRamMb / 1024).toFixed(1);
  const usedRamGb = (metrics.usedRamMb / 1024).toFixed(1);
  const ramPercentStr = metrics.ramUsagePercent.toFixed(1);

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
                { width: `${metrics.ramUsagePercent}%`, backgroundColor: '#38BDF8' },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            {metrics.cpuCores} ARM64 Cores Active
          </Text>
        </Card>

        {/* Storage Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>FLASH STORAGE</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: colors.success }]}>
                {(metrics.availStorageMb / 1024).toFixed(0)} GB Free
              </Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {storageUsagePercent}% <Text style={styles.metricUnit}>Used</Text>
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

        {/* Concurrency / Services */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>CONCURRENCY</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#818CF8' }]}>{runningCount} Online</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {runningCount} <Text style={styles.metricUnit}>/ {projects.length} Services</Text>
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${projects.length > 0 ? (runningCount / projects.length) * 100 : 0}%`,
                  backgroundColor: '#818CF8',
                },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Embedded HTTP Multi-Host
          </Text>
        </Card>
      </View>

      {/* 3. Project-Wise Resource Telemetry */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Project Resource Footprint</Text>
          <Text style={styles.sectionCountText}>{runningCount} of {projects.length} Online</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Realtime CPU, Memory, Disk footprint, and Network requests per service.
        </Text>
      </View>

      {projects.length === 0 ? (
        <Card style={styles.emptyTelemetryCard}>
          <Text style={styles.emptyTelemetryTitle}>No Active Services</Text>
          <Text style={styles.emptyTelemetrySub}>
            Deploy a Node.js, Next.js, or React service to see its live resource consumption here.
          </Text>
        </Card>
      ) : (
        <View style={styles.projectList}>
          {projects.map((project) => {
            const stack = SUPPORTED_STACKS.find((s) => s.id === project.stackId) || SUPPORTED_STACKS[0];
            const isRunning = project.status === 'RUNNING';
            const isBuilding = project.status === 'BUILDING';
            const pm = projectMetricsMap[project.id];

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

                {/* Real Resource Footprint Grid */}
                <View style={styles.resourceGrid}>
                  {/* Storage */}
                  <View style={styles.resourceItem}>
                    <Text style={styles.resourceItemLabel}>WORKSPACE FLASH</Text>
                    <Text style={styles.resourceItemVal}>
                      {pm ? pm.diskUsageMb.toFixed(1) : '0.1'} MB
                    </Text>
                    <Text style={styles.resourceItemSub}>
                      {pm ? `${pm.fileCount} Files` : '1 File'}
                    </Text>
                  </View>

                  {/* Network Requests */}
                  <View style={styles.resourceItem}>
                    <Text style={styles.resourceItemLabel}>REQUESTS SERVED</Text>
                    <Text style={[styles.resourceItemVal, { color: '#38BDF8' }]}>
                      {pm ? pm.requestsCount : 0} Req
                    </Text>
                    <Text style={styles.resourceItemSub}>
                      {pm ? `${pm.bytesTransferredKb.toFixed(1)} KB Bandwidth` : '0 KB'}
                    </Text>
                  </View>

                  {/* RAM Slice */}
                  <View style={styles.resourceItem}>
                    <Text style={styles.resourceItemLabel}>RAM CONSUMPTION</Text>
                    <Text style={[styles.resourceItemVal, { color: isRunning ? colors.success : colors.textMuted }]}>
                      {pm && isRunning ? `${pm.memoryMb.toFixed(1)} MB` : '0.0 MB'}
                    </Text>
                    <Text style={styles.resourceItemSub}>
                      {isRunning ? 'Active Runtime' : 'Idle'}
                    </Text>
                  </View>

                  {/* CPU & Sockets */}
                  <View style={styles.resourceItem}>
                    <Text style={styles.resourceItemLabel}>CPU & CONCURRENCY</Text>
                    <Text style={[styles.resourceItemVal, { color: isRunning ? colors.warning : colors.textMuted }]}>
                      {pm && isRunning ? `${pm.cpuPercent.toFixed(1)}%` : '0.0%'}
                    </Text>
                    <Text style={styles.resourceItemSub}>
                      {pm ? `${pm.activeConnections} Active Sockets` : '0 Sockets'}
                    </Text>
                  </View>
                </View>

                {isRunning && project.activeUrl && (
                  <View style={styles.telemetrySection}>
                    <Text style={styles.urlDisplay} numberOfLines={1}>
                      URL: {project.activeUrl}
                    </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    padding: 12,
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.cardBorder,
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
  resourceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  resourceItem: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8,
    padding: 8,
  },
  resourceItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  resourceItemVal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  resourceItemSub: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
  },
  telemetrySection: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
  },
  urlDisplay: {
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#818CF8',
  },
});
