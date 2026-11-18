import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { Card } from '../components/Card';
import { useApp } from '../store/AppContext';
import { SoftwareItem } from '../types/software';
import { IconTrash } from '../components/Icons';

type FilterCategory = 'all' | 'runtime' | 'tunnel' | 'tool';

export const SoftwareManagerScreen: React.FC = () => {
  const {
    softwares,
    installingPackageId,
    packageInstallProgress,
    uninstallSoftware,
    installSoftware,
    cleanCache,
    totalStorageMb,
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  const filteredSoftwares = softwares.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });

  const installedCount = softwares.filter((s) => s.isInstalled).length;

  const handleUninstall = (item: SoftwareItem) => {
    if (item.isCore) {
      Alert.alert(
        'Protected Core',
        `${item.name} is the fundamental system call engine (PRoot) required to run Linux binaries on Android. It cannot be removed.`
      );
      return;
    }

    Alert.alert(
      `Uninstall ${item.name}?`,
      `Are you sure you want to uninstall this package? This will remove the executable and reclaim ${item.sizeMb} MB of internal storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uninstall',
          style: 'destructive',
          onPress: () => {
            uninstallSoftware(item.id);
            Alert.alert(
              'Uninstalled',
              `${item.name} has been removed. Freed ${item.sizeMb} MB of storage.`
            );
          },
        },
      ]
    );
  };

  const handleInstall = (item: SoftwareItem) => {
    Alert.alert(
      `Install ${item.name}?`,
      `Download and install ${item.name} (~${item.sizeMb} MB) directly onto this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Install Now',
          onPress: () => {
            installSoftware(item.id);
          },
        },
      ]
    );
  };

  const handleCleanCache = () => {
    Alert.alert(
      'Clean Temporary Caches?',
      'This will clear build caches, package manager temp files, and stored terminal logs to reclaim storage.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clean Now',
          onPress: () => {
            cleanCache();
            Alert.alert('Caches Cleared', 'Freed 18.4 MB of temporary storage.');
          },
        },
      ]
    );
  };

  const getCategoryBadgeColor = (cat: string) => {
    switch (cat) {
      case 'runtime':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: colors.success };
      case 'tunnel':
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' };
      case 'tool':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: colors.warning };
      case 'core':
        return { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', text: colors.textMuted };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Installed Packages</Text>
        <Text style={styles.subtitle}>
          Linux ARM64 runtimes, tunnel daemons, and system CLI tools installed in your mobile environment.
        </Text>
      </View>

      {/* Storage Overview Card */}
      <Card style={styles.storageCard}>
        <View style={styles.storageHeader}>
          <View>
            <Text style={styles.storageLabel}>MOBILE STORAGE USAGE</Text>
            <View style={styles.storageValueRow}>
              <Text style={styles.storageValue}>{totalStorageMb.toFixed(1)}</Text>
              <Text style={styles.storageUnit}> MB</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.cleanBtn}
            onPress={handleCleanCache}
            activeOpacity={0.8}
          >
            <Text style={styles.cleanBtnText}>Purge Cache</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Storage Bar */}
        <View style={styles.barContainer}>
          {installedCount === 0 ? (
            <View style={[styles.barSegment, { flex: 1, backgroundColor: colors.cardBorder }]} />
          ) : (
            softwares
              .filter((s) => s.isInstalled)
              .map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.barSegment,
                    {
                      flex: Math.max(1, s.sizeMb),
                      backgroundColor:
                        s.id === 'nodejs'
                          ? colors.success
                          : s.id === 'python'
                          ? '#38bdf8'
                          : s.id === 'cloudflared'
                          ? '#f97316'
                          : s.id === 'zrok'
                          ? '#8b5cf6'
                          : s.id === 'git'
                          ? colors.warning
                          : '#94a3b8',
                    },
                  ]}
                />
              ))
          )}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {softwares.map((s) => (
            <View key={s.id} style={[styles.legendItem, !s.isInstalled && { opacity: 0.35 }]}>
              <View
                style={[
                  styles.legendDot,
                  {
                    backgroundColor:
                      s.id === 'nodejs'
                        ? colors.success
                        : s.id === 'python'
                        ? '#38bdf8'
                        : s.id === 'cloudflared'
                        ? '#f97316'
                        : s.id === 'zrok'
                        ? '#8b5cf6'
                        : s.id === 'git'
                        ? colors.warning
                        : '#94a3b8',
                  },
                ]}
              />
              <Text style={styles.legendText}>{s.icon}</Text>
            </View>
          ))}
        </View>

        <View style={styles.storageFooter}>
          <Text style={styles.storageStatusText}>
            {installedCount === 0
              ? 'No packages installed yet. Tap + Install on any runtime below.'
              : `${installedCount} of ${softwares.length} software packages currently installed`}
          </Text>
        </View>
      </Card>

      {/* Category Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'runtime', 'tunnel', 'tool'] as FilterCategory[]).map((cat) => {
          const isActive = activeCategory === cat;
          const labels: Record<FilterCategory, string> = {
            all: 'All Packages',
            runtime: 'Runtimes',
            tunnel: 'Tunnels',
            tool: 'CLI Tools',
          };
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveCategory(cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {labels[cat]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Packages List */}
      <View style={styles.packageList}>
        {filteredSoftwares.map((item) => {
          const catColor = getCategoryBadgeColor(item.category);

          return (
            <Card key={item.id} style={styles.packageCard}>
              {/* Top row: Icon + Name + Category + Status */}
              <View style={styles.packageHeader}>
                <View style={styles.packageIconBox}>
                  <Text style={styles.packageIcon}>{item.icon}</Text>
                </View>

                <View style={styles.packageInfo}>
                  <View style={styles.packageNameRow}>
                    <Text style={styles.packageName}>{item.name}</Text>
                    {item.isCore && (
                      <View style={styles.coreBadge}>
                        <Text style={styles.coreBadgeText}>CORE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.packageVersion}>{item.version}</Text>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.statusBadge,
                    item.isInstalled
                      ? styles.statusBadgeInstalled
                      : styles.statusBadgeMissing,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.isInstalled
                        ? styles.statusTextInstalled
                        : styles.statusTextMissing,
                    ]}
                  >
                    {item.isInstalled ? 'INSTALLED' : 'NOT INSTALLED'}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.packageDescription}>{item.description}</Text>

              {/* Path box */}
              {item.isInstalled && (
                <View style={styles.pathBox}>
                  <Text style={styles.pathLabel}>PATH: </Text>
                  <Text style={styles.pathText} numberOfLines={1}>
                    {item.path}
                  </Text>
                </View>
              )}

              {/* Card Footer: Size + Actions */}
              <View style={styles.packageFooter}>
                <View style={styles.sizeWrap}>
                  <View
                    style={[
                      styles.catBadge,
                      { backgroundColor: catColor.bg },
                    ]}
                  >
                    <Text style={[styles.catBadgeText, { color: catColor.text }]}>
                      {item.category.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.sizeText}>{item.sizeMb} MB</Text>
                </View>

                {/* Action button */}
                {installingPackageId === item.id ? (
                  <View style={styles.installingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.installingText} numberOfLines={1}>
                      {packageInstallProgress?.percentage
                        ? `${packageInstallProgress.percentage}%`
                        : 'Installing...'}
                    </Text>
                  </View>
                ) : item.isInstalled ? (
                  item.isCore ? (
                    <View style={styles.protectedBtn}>
                      <Text style={styles.protectedBtnText}>System Core</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uninstallBtn}
                      onPress={() => handleUninstall(item)}
                      activeOpacity={0.7}
                    >
                      <IconTrash size={12} color="#F87171" />
                      <Text style={styles.uninstallBtnText}>Uninstall</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TouchableOpacity
                    style={styles.installBtn}
                    onPress={() => handleInstall(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.installBtnText}>+ Install ({item.sizeMb} MB)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* How it works info box */}
      <View style={styles.infoBox}>
        <View style={styles.infoTag}>
          <Text style={styles.infoTagText}>INFO</Text>
        </View>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>Architecture & Storage Isolation</Text>
          <Text style={styles.infoText}>
            PocketHost executes native Linux ARM64 ELF binaries directly within an isolated unprivileged PRoot userland. No root permissions are used.
          </Text>
          <Text style={styles.infoText}>
            Uninstall unused runtimes or tunnel daemons to free up device flash memory. All packages can be re-installed on demand with one tap.
          </Text>
        </View>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  storageCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  storageLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  storageValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  storageValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  storageUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cleanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cleanBtnIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  cleanBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f87171',
  },
  barContainer: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHighlight,
    marginBottom: 12,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  storageFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 10,
  },
  storageStatusText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  packageList: {
    gap: 12,
    marginBottom: 20,
  },
  packageCard: {
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  packageIcon: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: colors.textPrimary,
  },
  packageInfo: {
    flex: 1,
  },
  packageNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  packageName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  coreBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  coreBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#a78bfa',
  },
  packageVersion: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  statusBadgeInstalled: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusBadgeMissing: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  statusTextInstalled: {
    color: colors.success,
  },
  statusTextMissing: {
    color: colors.textMuted,
  },
  packageDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  pathBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  pathLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pathText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'monospace',
    flex: 1,
  },
  packageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sizeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  sizeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  uninstallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  uninstallIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  uninstallBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f87171',
  },
  protectedBtn: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  protectedBtnText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  installIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  installBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  installingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  installingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  infoTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-start',
  },
  infoTagText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  infoContent: {
    flex: 1,
    gap: 6,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  infoText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
