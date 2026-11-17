import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { SUPPORTED_STACKS, TechStack, TechStackId } from '../types/stack';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { IconSettings, IconPackage } from '../components/Icons';

interface StackSelectionScreenProps {
  onStackChosen: (stack: TechStack) => void;
  initialStackId?: TechStackId;
  onOpenConfig?: (projectId: string) => void;
}

export const StackSelectionScreen: React.FC<StackSelectionScreenProps> = ({
  onStackChosen,
  initialStackId,
  onOpenConfig,
}) => {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    createProject,
    startProject,
    stopProject,
  } = useApp();

  const [selectedStackId, setSelectedStackId] = useState<TechStackId>(
    initialStackId || 'node-api'
  );

  const selectedStack =
    SUPPORTED_STACKS.find((s) => s.id === selectedStackId) || SUPPORTED_STACKS[0];

  const stackProjects = projects.filter((p) => p.stackId === selectedStackId);

  const handleCreateNew = () => {
    const newProj = createProject(selectedStackId);
    setActiveProjectId(newProj.id);
    if (onOpenConfig) {
      onOpenConfig(newProj.id);
    } else {
      onStackChosen(selectedStack);
    }
  };

  const getPublicUrlBadge = (type: string) => {
    switch (type) {
      case 'cloudflare':
        return 'CF • Cloudflare';
      case 'zrok':
        return 'ZR • zrok';
      default:
        return 'LAN • Local';
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Frameworks & Projects</Text>
        <Text style={styles.subheading}>
          Select a runtime to manage its projects, configure environment variables, and deploy.
        </Text>
      </View>

      {/* 2. Framework Selector Pills */}
      <View style={styles.frameworkBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frameworkRow}>
          {SUPPORTED_STACKS.map((stack) => {
            const isSelected = selectedStackId === stack.id;
            const count = projects.filter((p) => p.stackId === stack.id).length;
            return (
              <TouchableOpacity
                key={stack.id}
                style={[styles.frameworkPill, isSelected && styles.frameworkPillActive]}
                onPress={() => setSelectedStackId(stack.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.frameworkIcon}>{stack.icon}</Text>
                <Text style={[styles.frameworkName, isSelected && styles.frameworkNameActive]}>
                  {stack.name}
                </Text>
                {count > 0 && (
                  <View style={[styles.pillCount, isSelected && styles.pillCountActive]}>
                    <Text style={[styles.pillCountText, isSelected && styles.pillCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Projects under Selected Framework */}
      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {/* Framework Info Banner */}
        <View style={styles.stackBanner}>
          <View style={styles.stackBannerLeft}>
            <Text style={styles.stackBannerIcon}>{selectedStack.icon}</Text>
            <View>
              <Text style={styles.stackBannerTitle}>{selectedStack.name}</Text>
              <Text style={styles.stackBannerTagline}>{selectedStack.tagline}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.addProjBtn}
            onPress={handleCreateNew}
            activeOpacity={0.8}
          >
            <Text style={styles.addProjBtnText}>+ New Project</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          Projects under {selectedStack.name} ({stackProjects.length})
        </Text>

        {stackProjects.map((project, idx) => {
          const isRunning = project.status === 'RUNNING';
          const isBuilding = project.status === 'BUILDING';

          return (
            <Card key={project.id} style={styles.projectCard}>
              <View style={styles.projectCardTop}>
                <View style={styles.projectHeaderLeft}>
                  <View style={styles.indexBox}>
                    <Text style={styles.indexText}>#{idx + 1}</Text>
                  </View>
                  <View style={styles.projectNameBlock}>
                    <View style={styles.nameRow}>
                      <Text style={styles.projectName}>{project.name}</Text>
                      {project.isDemo && (
                        <View style={styles.demoBadge}>
                          <Text style={styles.demoBadgeText}>DEMO TEMPLATE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.projectSub}>
                      Port: <Text style={styles.highlightText}>{project.port}</Text> • URL: <Text style={styles.highlightText}>{getPublicUrlBadge(project.publicUrlType)}</Text>
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

              {/* Environment Variables Snippet */}
              <View style={styles.envSnippetBox}>
                <Text style={styles.envSnippetLabel}>Environment Variables (.env):</Text>
                <View style={styles.envChipsRow}>
                  {project.envVars.map((env, i) => (
                    <View key={i} style={styles.envChip}>
                      <Text style={styles.envChipKey}>{env.key}</Text>
                      <Text style={styles.envChipVal}>
                        ={env.key.includes('URI') || env.key.includes('SECRET') ? '••••' : env.value}
                      </Text>
                    </View>
                  ))}
                  {project.envVars.length === 0 && (
                    <Text style={styles.noEnvText}>No environment variables defined.</Text>
                  )}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.cardActionsRow}>
                <View style={styles.actionsLeft}>
                  {isRunning ? (
                    <TouchableOpacity
                      style={styles.stopActionBtn}
                      onPress={() => stopProject(project.id)}
                    >
                      <Text style={styles.actionBtnText}>⏹ Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.startActionBtn}
                      onPress={() => startProject(project.id)}
                      disabled={isBuilding}
                    >
                      <Text style={styles.actionBtnText}>
                        {isBuilding ? 'Starting...' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.configActionBtn}
                  onPress={() => {
                    setActiveProjectId(project.id);
                    if (onOpenConfig) {
                      onOpenConfig(project.id);
                    }
                  }}
                >
                  <IconSettings size={12} color={colors.textSecondary} />
                  <Text style={styles.configActionText}>Configure & .env</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })}

        {stackProjects.length === 0 && (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrapper}>
              <IconPackage size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Projects Created Yet</Text>
            <Text style={styles.emptySubtitle}>
              Create your first {selectedStack.name} project to configure ports, commands, and environment variables.
            </Text>
            <TouchableOpacity style={styles.emptyCreateBtn} onPress={handleCreateNew}>
              <Text style={styles.emptyCreateBtnText}>+ Create {selectedStack.name} Project</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subheading: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  frameworkBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  frameworkRow: {
    paddingHorizontal: 14,
    gap: 8,
  },
  frameworkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  frameworkPillActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  frameworkIcon: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  frameworkName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  frameworkNameActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  pillCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  pillCountActive: {
    backgroundColor: colors.primary,
  },
  pillCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pillCountTextActive: {
    color: '#FFFFFF',
  },
  scrollList: {
    padding: 16,
    paddingBottom: 40,
  },
  stackBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stackBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  stackBannerIcon: {
    fontSize: 24,
  },
  stackBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stackBannerTagline: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  addProjBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addProjBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  projectCard: {
    padding: 14,
    marginBottom: 12,
    borderRadius: 14,
  },
  projectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  projectHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  indexBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
  },
  projectNameBlock: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  demoBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  demoBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#818CF8',
  },
  projectSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  highlightText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  envSnippetBox: {
    backgroundColor: colors.surfaceHighlight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  envSnippetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 5,
    letterSpacing: 0.3,
  },
  envChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  envChip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  envChipKey: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#38BDF8',
  },
  envChipVal: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  noEnvText: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  startActionBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 7,
  },
  stopActionBtn: {
    backgroundColor: colors.error,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 7,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  configActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  configActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyIconWrapper: {
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  emptyCreateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyCreateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
