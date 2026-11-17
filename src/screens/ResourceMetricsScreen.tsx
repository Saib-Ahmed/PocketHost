import React, { useState, useEffect } from 'react';
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
import { IconMetrics, IconPlay } from '../components/Icons';

export const ResourceMetricsScreen: React.FC = () => {
  const { projects, startProject, totalStorageMb } = useApp();

  // Simulated live telemetry tick for authentic procfs updates
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');
  const runningCount = runningProjects.length;

  // Dynamic system-level metrics based on running services
  const baseSystemRamMb = 1840;
  const projectRamBase: Record<string, number> = {
    'demo-backend-api': 68.4,
    'demo-frontend-react': 42.1,
    'demo-python-service': 84.5,
  };
  const projectCpuBase: Record<string, number> = {
    'demo-backend-api': 3.4,
    'demo-frontend-react': 1.1,
    'demo-python-service': 4.8,
  };

  // Small organic jitter to simulate real CPU and memory fluctuations
  const jitter = (seed: number, amp: number) => {
    return Math.sin(tick * 1.5 + seed) * amp;
  };

  const totalPocketHostRamMb = runningProjects.reduce((sum, p, idx) => {
    const base = projectRamBase[p.id] || 48.0;
    return sum + base + jitter(idx * 2, 2.5);
  }, 32.0); // 32MB PRoot core overhead

  const totalPocketHostCpu = runningProjects.reduce((sum, p, idx) => {
    const base = projectCpuBase[p.id] || 2.0;
    return sum + Math.max(0.4, base + jitter(idx * 3, 0.8));
  }, runningCount > 0 ? 0.8 : 0.0);

  const overallSystemRamGb = ((baseSystemRamMb + totalPocketHostRamMb) / 1024).toFixed(2);
  const overallSystemRamPct = (((baseSystemRamMb + totalPocketHostRamMb) / 6144) * 100).toFixed(1);
  const overallSystemCpuPct = Math.min(98, Math.max(3.2, 8.5 + totalPocketHostCpu + jitter(9, 1.8))).toFixed(1);

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
            <Text style={styles.liveText}>REALTIME</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Kernel procfs resource tracking across isolated Android Linux runtime.
        </Text>
      </View>

      {/* 2. Top Summary Overview Cards (2x2 Grid) */}
      <View style={styles.metricsGrid}>
        {/* RAM Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>TOTAL RAM</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#38BDF8' }]}>{overallSystemRamPct}%</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{overallSystemRamGb} <Text style={styles.metricUnit}>/ 6.0 GB</Text></Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${overallSystemRamPct}%`, backgroundColor: '#38BDF8' },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Container: {totalPocketHostRamMb.toFixed(1)} MB
          </Text>
        </Card>

        {/* CPU Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>CPU LOAD</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#818CF8' }]}>8 Cores</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{overallSystemCpuPct}% <Text style={styles.metricUnit}>ARM64</Text></Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${overallSystemCpuPct}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Services Load: {totalPocketHostCpu.toFixed(1)}%
          </Text>
        </Card>

        {/* Storage Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>FLASH STORAGE</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: colors.success }]}>ROOTFS</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{totalStorageMb.toFixed(1)} <Text style={styles.metricUnit}>MB</Text></Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: '22%', backgroundColor: colors.success },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Phone Free: 84.2 GB
          </Text>
        </Card>

        {/* Network I/O Card */}
        <Card style={styles.metricCard}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>NETWORK I/O</Text>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Text style={[styles.pillBadgeText, { color: colors.warning }]}>ACTIVE</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>
            {(12.4 + jitter(5, 3.1)).toFixed(1)} <Text style={styles.metricUnit}>KB/s</Text>
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: '18%', backgroundColor: colors.warning },
              ]}
            />
          </View>
          <Text style={styles.metricSubText}>
            Outbound: {(18.6 + jitter(7, 4.2)).toFixed(1)} KB/s
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
          Individual process memory footprint and CPU utilization per configured service.
        </Text>
      </View>

      <View style={styles.projectList}>
        {projects.map((project, idx) => {
          const stack = SUPPORTED_STACKS.find((s) => s.id === project.stackId) || SUPPORTED_STACKS[0];
          const isRunning = project.status === 'RUNNING';
          const isBuilding = project.status === 'BUILDING';

          const memUsageMb = isRunning
            ? (projectRamBase[project.id] || 48.0) + jitter(idx * 2, 1.8)
            : 0;
          const cpuUsagePct = isRunning
            ? Math.max(0.4, (projectCpuBase[project.id] || 2.0) + jitter(idx * 3, 0.6))
            : 0;

          // Virtual PID based on project id seed
          const virtualPid = 4100 + (idx * 314);

          return (
            <Card key={project.id} style={styles.projectCard}>
              {/* Top row */}
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
                      Port {project.port} • {isRunning ? `PID ${virtualPid} • ${formatUptime(project.uptimeSeconds)}` : 'Offline'}
                    </Text>
                  </View>
                </View>

                <Badge
                  label={project.status}
                  color={isRunning ? colors.success : isBuilding ? colors.warning : colors.textMuted}
                  bgColor={isRunning ? colors.successMuted : isBuilding ? colors.warningMuted : colors.surfaceHighlight}
                />
              </View>

              {/* Resource Bars Section */}
              {isRunning ? (
                <View style={styles.telemetrySection}>
                  {/* Memory Row */}
                  <View style={styles.telemetryRow}>
                    <View style={styles.telemetryLabelWrap}>
                      <Text style={styles.telemetryName}>RAM Usage</Text>
                      <Text style={styles.telemetryNumber}>{memUsageMb.toFixed(1)} MB</Text>
                    </View>
                    <View style={styles.telemetryBarBg}>
                      <View
                        style={[
                          styles.telemetryBarFill,
                          {
                            width: `${Math.min(100, (memUsageMb / 128) * 100)}%`,
                            backgroundColor: '#38BDF8',
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* CPU Row */}
                  <View style={styles.telemetryRow}>
                    <View style={styles.telemetryLabelWrap}>
                      <Text style={styles.telemetryName}>CPU Core Share</Text>
                      <Text style={styles.telemetryNumber}>{cpuUsagePct.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.telemetryBarBg}>
                      <View
                        style={[
                          styles.telemetryBarFill,
                          {
                            width: `${Math.min(100, cpuUsagePct * 10)}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Network / Socket info */}
                  <View style={styles.socketRow}>
                    <Text style={styles.socketText}>
                      SOCKET: TCP 0.0.0.0:{project.port} (LISTEN)
                    </Text>
                    <Text style={styles.socketText}>
                      TUNNEL: {project.publicUrlType.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.idleTelemetryBox}>
                  <Text style={styles.idleTelemetryText}>
                    Process terminated. 0.0 MB RAM • 0.0% CPU
                  </Text>
                  <TouchableOpacity
                    style={styles.quickStartBtn}
                    onPress={() => startProject(project.id)}
                    activeOpacity={0.7}
                  >
                    <IconPlay size={10} color="#FFFFFF" />
                    <Text style={styles.quickStartBtnText}>Start</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          );
        })}
      </View>
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
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pillBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pillBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 2,
    overflow: 'hidden',
    marginVertical: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  metricSubText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  projectList: {
    gap: 12,
  },
  projectCard: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  projectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  stackBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stackBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  projectDetails: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  projectMeta: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  telemetrySection: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 10,
  },
  telemetryRow: {
    gap: 4,
  },
  telemetryLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  telemetryNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  telemetryBarBg: {
    height: 5,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  telemetryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  socketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  socketText: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    fontWeight: '600',
  },
  idleTelemetryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
  },
  idleTelemetryText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  quickStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickStartBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
