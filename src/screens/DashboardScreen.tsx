import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatUptime } from '../utils/formatters';
import { SUPPORTED_STACKS, TechStack, TechStackId } from '../types/stack';
import { ProjectItem } from '../types/project';
import {
  IconPlay,
  IconStop,
  IconRefresh,
  IconExternalLink,
  IconSettings,
  IconTerminal,
} from '../components/Icons';

interface DashboardScreenProps {
  onOpenTerminal: () => void;
  onOpenConfig: (projectId?: string) => void;
  onOpenStacks: (stackId?: TechStackId) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenTerminal,
  onOpenConfig,
  onOpenStacks,
}) => {
  const {
    projects,
    startProject,
    stopProject,
    restartProject,
    setActiveProjectId,
    createProject,
    logs,
  } = useApp();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const runningCount = projects.filter((p) => p.status === 'RUNNING').length;
  const recentLogs = logs.slice(-3);

  const openUrl = (url?: string) => {
    if (!url) return;
    Linking.canOpenURL(url).then((supported: boolean) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open URL', `Unable to open: ${url}`);
      }
    });
  };

  const shareUrl = async (url?: string) => {
    if (!url) return;
    try {
      await Share.share({
        message: `My service is running on Android via PocketHost: ${url}`,
        url,
      });
    } catch (_: any) {}
  };

  const copyUrl = (id: string, url?: string) => {
    if (!url) return;
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPublicUrlBadge = (type: string) => {
    switch (type) {
      case 'cloudflare':
        return 'CF';
      case 'zrok':
        return 'ZROK';
      default:
        return 'LAN';
    }
  };

  const getPublicUrlLabel = (type: string) => {
    switch (type) {
      case 'cloudflare':
        return 'Cloudflare';
      case 'zrok':
        return 'zrok';
      default:
        return 'Wi-Fi';
    }
  };

  const handleQuickCreate = async (stackId: TechStackId) => {
    const newProj = await createProject(stackId);
    setActiveProjectId(newProj.id);
    onOpenConfig(newProj.id);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 1. Hosting Overview Header */}
      <View style={styles.overviewCard}>
        <View style={styles.overviewTop}>
          <View style={styles.overviewLeft}>
            <View style={styles.livePulse}>
              <View style={[styles.pulseDot, { backgroundColor: runningCount > 0 ? colors.success : colors.textMuted }]} />
            </View>
            <View>
              <Text style={styles.overviewHeading}>
                {runningCount > 0 ? `${runningCount} Services Active` : 'Engine Idle'}
              </Text>
              <Text style={styles.overviewSub}>
                {projects.length} Projects Configured • Android ARM64 Host
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.newProjectHeaderBtn}
            onPress={() => onOpenStacks()}
            activeOpacity={0.8}
          >
            <Text style={styles.newProjectHeaderBtnText}>+ New Project</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Projects List: Ready to Run & Control */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Services & Deployments</Text>
        <Text style={styles.sectionSubtitle}>
          Start, stop, and access public URLs directly
        </Text>
      </View>

      {projects.length === 0 ? (
        <Card style={styles.emptyProjectsCard}>
          <Text style={styles.emptyProjectsTitle}>No Hosted Services Yet</Text>
          <Text style={styles.emptyProjectsSubtitle}>
            PocketHost runs local servers directly on your Android phone. Tap a starter template below or create a project to deploy your first real service.
          </Text>
          <TouchableOpacity
            style={styles.emptyCreateBtn}
            onPress={() => onOpenStacks()}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCreateBtnText}>+ Deploy First Project</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        projects.map((project) => {
          const stack = SUPPORTED_STACKS.find((s) => s.id === project.stackId) || SUPPORTED_STACKS[0];
          const isRunning = project.status === 'RUNNING';
          const isBuilding = project.status === 'BUILDING';

          return (
            <Card key={project.id} style={styles.projectCard}>
              <View style={styles.projectTopRow}>
                <View style={styles.projectIdentity}>
                  <View style={[styles.projectStackIconBox, { backgroundColor: `${stack.badgeColor}25` }]}>
                    <Text style={styles.projectStackIcon}>{stack.icon}</Text>
                  </View>
                  <View style={styles.projectTextWrap}>
                    <View style={styles.projectNameRow}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                    </View>
                    <Text style={styles.projectMetaText}>
                      {stack.name} • Port {project.port} {isRunning ? `• ${formatUptime(project.uptimeSeconds)}` : ''}
                    </Text>
                  </View>
                </View>

              <Badge
                label={project.status}
                color={
                  isRunning
                    ? colors.success
                    : isBuilding
                    ? colors.warning
                    : colors.textMuted
                }
                bgColor={
                  isRunning
                    ? colors.successMuted
                    : isBuilding
                    ? colors.warningMuted
                    : colors.surfaceHighlight
                }
              />
            </View>

            {/* Little Link Option (Only shows user's chosen URL option) */}
            <View style={styles.urlPillRow}>
              <View style={styles.urlIconBadge}>
                <Text style={styles.urlIconBadgeText}>{getPublicUrlBadge(project.publicUrlType)}</Text>
                <Text style={styles.urlProviderName}>{getPublicUrlLabel(project.publicUrlType)}</Text>
              </View>

              {isRunning && project.activeUrl ? (
                <View style={styles.activeLinkActions}>
                  <TouchableOpacity
                    style={styles.urlLinkBtn}
                    onPress={() => openUrl(project.activeUrl)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.urlLinkText} numberOfLines={1}>
                      {project.activeUrl.replace('https://', '').replace('http://', '')}
                    </Text>
                    <IconExternalLink size={11} color="#A5B4FC" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => shareUrl(project.activeUrl)}
                  >
                    <IconExternalLink size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.urlOfflineHint}>
                  {project.publicUrlType === 'cloudflare'
                    ? 'Cloudflare Quick Tunnel ready on start'
                    : project.publicUrlType === 'zrok'
                    ? 'zrok Peer Tunnel ready on start'
                    : 'Local Wi-Fi LAN only'}
                </Text>
              )}
            </View>

            {/* Action Bar: Start / Stop & Configure */}
            <View style={styles.projectActionRow}>
              <View style={styles.actionLeft}>
                {isRunning ? (
                  <TouchableOpacity
                    style={styles.stopBtn}
                    onPress={() => stopProject(project.id)}
                    activeOpacity={0.8}
                  >
                    <IconStop size={10} color="#EF4444" />
                    <Text style={styles.stopBtnText}>Stop</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.startBtn}
                    onPress={() => startProject(project.id)}
                    disabled={isBuilding}
                    activeOpacity={0.8}
                  >
                    <IconPlay size={10} color="#FFFFFF" />
                    <Text style={styles.startBtnText}>
                      {isBuilding ? 'Starting...' : 'Start'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isRunning && (
                  <TouchableOpacity
                    style={styles.restartIconBtn}
                    onPress={() => restartProject(project.id)}
                    activeOpacity={0.7}
                  >
                    <IconRefresh size={13} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.configBtn}
                onPress={() => {
                  setActiveProjectId(project.id);
                  onOpenConfig(project.id);
                }}
                activeOpacity={0.7}
              >
                <IconSettings size={13} color={colors.textSecondary} />
                <Text style={styles.configBtnText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      }))}

      {/* 3. Quick Frameworks & Tech Stacks (2-Column Grid Layout) */}
      <View style={[styles.sectionHeader, { marginTop: 10 }]}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Framework Templates</Text>
            <Text style={styles.sectionSubtitle}>
              Select a runtime to configure and launch
            </Text>
          </View>
          <TouchableOpacity onPress={() => onOpenStacks()}>
            <Text style={styles.seeAllText}>Browse →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.gridContainer}>
        {SUPPORTED_STACKS.map((stack) => {
          const matchingProjects = projects.filter((p) => p.stackId === stack.id);
          return (
            <TouchableOpacity
              key={stack.id}
              style={styles.gridCard}
              onPress={() => onOpenStacks(stack.id)}
              activeOpacity={0.75}
            >
              <View style={styles.gridCardTop}>
                <View style={[styles.gridIconBox, { backgroundColor: `${stack.badgeColor}22` }]}>
                  <Text style={styles.gridIcon}>{stack.icon}</Text>
                </View>
                <View style={styles.gridCountPill}>
                  <Text style={styles.gridCountPillText}>{matchingProjects.length} Proj</Text>
                </View>
              </View>

              <Text style={styles.gridCardTitle}>{stack.name}</Text>
              <Text style={styles.gridCardTagline} numberOfLines={1}>{stack.tagline}</Text>

              <View style={styles.gridCardFooter}>
                <TouchableOpacity
                  style={styles.createProjLink}
                  onPress={() => handleQuickCreate(stack.id)}
                >
                  <Text style={styles.createProjLinkText}>+ Add Project</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4. Live Logs Console Snippet */}
      <Card style={styles.logsSnippetCard}>
        <View style={styles.logsHeader}>
          <View style={styles.logsHeaderLeft}>
            <IconTerminal size={15} color={colors.primary} />
            <Text style={styles.logsTitle}>Build & Process Logs</Text>
          </View>
          <TouchableOpacity onPress={onOpenTerminal}>
            <Text style={styles.viewAllLogs}>Full Console →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.terminalBox}>
          {recentLogs.length > 0 ? (
            recentLogs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                {log.projectName && (
                  <Text style={styles.logProjectTag}>[{log.projectName}] </Text>
                )}
                <Text
                  style={[
                    styles.logLine,
                    log.channel === 'stderr' && styles.logStderr,
                    log.channel === 'system' && styles.logSystem,
                  ]}
                  numberOfLines={1}
                >
                  {log.text}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyLogsText}>
              Console output ready. Start any service above to view live logs.
            </Text>
          )}
        </View>
      </Card>
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
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  livePulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  overviewHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  overviewSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  newProjectHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newProjectHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  projectCard: {
    padding: 15,
    marginBottom: 12,
    borderRadius: 16,
  },
  projectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  projectIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  projectStackIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  projectStackIcon: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: colors.textPrimary,
  },
  projectTextWrap: {
    flex: 1,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  demoBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  demoBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#818CF8',
  },
  projectMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  urlPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
    gap: 8,
  },
  urlIconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urlIconBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#A5B4FC',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  urlProviderName: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activeLinkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  urlLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 6,
  },
  urlLinkText: {
    fontSize: 12,
    color: '#38BDF8',
    fontFamily: 'monospace',
    fontWeight: '600',
    flex: 1,
  },
  urlExternalIcon: {
    fontSize: 11,
    color: '#38BDF8',
  },
  shareBtn: {
    padding: 3,
  },
  shareBtnIcon: {
    fontSize: 13,
  },
  urlOfflineHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  projectActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  startBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  stopBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F87171',
    letterSpacing: 0.2,
  },
  restartIconBtn: {
    backgroundColor: colors.surfaceHighlight,
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  configBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  configBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  gridCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridIconBox: {
    width: 32,
    height: 32,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gridIcon: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: colors.textPrimary,
  },
  gridCountPill: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  gridCountPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  gridCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  gridCardTagline: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  gridCardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 6,
  },
  createProjLink: {
    alignSelf: 'flex-start',
  },
  createProjLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  logsSnippetCard: {
    padding: 14,
    borderRadius: 14,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logsConsoleIcon: {
    fontSize: 14,
  },
  logsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  viewAllLogs: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  terminalBox: {
    backgroundColor: colors.terminalBg,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.terminalBorder,
    minHeight: 65,
    justifyContent: 'center',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },
  logProjectTag: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.primary,
    fontWeight: '700',
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.terminalText,
    flex: 1,
  },
  logStderr: {
    color: colors.error,
  },
  emptyProjectsCard: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  emptyProjectsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyProjectsSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyCreateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyCreateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  logSystem: {
    color: colors.textMuted,
  },
  emptyLogsText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
