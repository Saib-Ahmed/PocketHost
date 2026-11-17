import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { SUPPORTED_STACKS } from '../types/stack';
import { IconTrash } from '../components/Icons';

type StreamFilter = 'all' | 'stdout' | 'stderr' | 'tunnel' | 'system';

export const TerminalLogScreen: React.FC = () => {
  const { logs, clearLogs, sendStdin, projects, activeProjectId, setActiveProjectId } = useApp();

  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('all');
  const [inputCmd, setInputCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const filteredLogs = logs.filter((log) => {
    // Project-wise filter
    if (selectedProjectFilter !== 'all' && log.projectId && log.projectId !== selectedProjectFilter) {
      return false;
    }

    // Stream-wise filter
    if (streamFilter === 'all') return true;
    if (streamFilter === 'stdout') return log.channel === 'stdout';
    if (streamFilter === 'stderr') return log.channel === 'stderr';
    if (streamFilter === 'tunnel') return log.sessionId.includes('tunnel');
    if (streamFilter === 'system') return log.channel === 'system';
    return true;
  });

  useEffect(() => {
    if (autoScroll) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [logs, autoScroll]);

  const handleSendStdin = async () => {
    if (!inputCmd.trim()) return;
    await sendStdin(inputCmd);
    setInputCmd('');
  };

  const currentProject = projects.find((p) => p.id === selectedProjectFilter);

  return (
    <View style={styles.container}>
      {/* 1. Project-Wise Filter Bar */}
      <View style={styles.projectFilterBar}>
        <Text style={styles.filterSectionTitle}>PROJECT:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projectPillsRow}>
          <TouchableOpacity
            style={[styles.projPill, selectedProjectFilter === 'all' && styles.projPillActive]}
            onPress={() => setSelectedProjectFilter('all')}
          >
            <Text style={[styles.projPillText, selectedProjectFilter === 'all' && styles.projPillTextActive]}>
              All Projects ({projects.length})
            </Text>
          </TouchableOpacity>

          {projects.map((p) => {
            const isSelected = selectedProjectFilter === p.id;
            const pStack = SUPPORTED_STACKS.find((s) => s.id === p.stackId);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.projPill, isSelected && styles.projPillActive]}
                onPress={() => {
                  setSelectedProjectFilter(p.id);
                  setActiveProjectId(p.id);
                }}
              >
                <Text style={styles.projPillIcon}>{pStack?.icon || 'APP'}</Text>
                <Text style={[styles.projPillText, isSelected && styles.projPillTextActive]}>
                  {p.name}
                </Text>
                {p.status === 'RUNNING' && <View style={styles.runningDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Stream Type Filter & Actions Bar */}
      <View style={styles.streamBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.streamTabs}>
          <TouchableOpacity
            style={[styles.streamTab, streamFilter === 'all' && styles.streamTabActive]}
            onPress={() => setStreamFilter('all')}
          >
            <Text style={[styles.streamTabText, streamFilter === 'all' && styles.streamTabTextActive]}>
              All Logs ({filteredLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.streamTab, streamFilter === 'stdout' && styles.streamTabActive]}
            onPress={() => setStreamFilter('stdout')}
          >
            <Text style={[styles.streamTabText, streamFilter === 'stdout' && styles.streamTabTextActive]}>
              Stdout
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.streamTab, streamFilter === 'stderr' && styles.streamTabActive]}
            onPress={() => setStreamFilter('stderr')}
          >
            <Text style={[styles.streamTabText, streamFilter === 'stderr' && styles.streamTabTextActive]}>
              Stderr
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.streamTab, streamFilter === 'tunnel' && styles.streamTabActive]}
            onPress={() => setStreamFilter('tunnel')}
          >
            <Text style={[styles.streamTabText, streamFilter === 'tunnel' && styles.streamTabTextActive]}>
              Tunnels
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.actionIcons}>
          <TouchableOpacity
            style={[styles.actionIconBtn, autoScroll && styles.actionIconBtnActive]}
            onPress={() => setAutoScroll(!autoScroll)}
          >
            <Text style={[styles.actionIconText, autoScroll && styles.actionIconTextActive]}>AUTO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={() => clearLogs(selectedProjectFilter === 'all' ? undefined : selectedProjectFilter)}
          >
            <IconTrash size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Terminal Viewport */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.terminalContainer}
        contentContainerStyle={styles.terminalContent}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.bootBanner}>
          PocketHost Multi-Process Terminal [Isolated Linux PRoot Engine]
        </Text>
        <Text style={styles.bootBannerSub}>
          Active View:{' '}
          {selectedProjectFilter === 'all'
            ? 'All Running Projects'
            : `${currentProject?.name} (${currentProject?.status})`}
        </Text>
        <View style={styles.divider} />

        {filteredLogs.map((log) => {
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          return (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.timestamp}>{timeStr}</Text>
              {selectedProjectFilter === 'all' && log.projectName && (
                <Text style={styles.projectTag}>[{log.projectName}]</Text>
              )}
              <Text
                style={[
                  styles.logText,
                  log.channel === 'stderr' && styles.logStderr,
                  log.channel === 'system' && styles.logSystem,
                ]}
                selectable={true}
              >
                {log.text}
              </Text>
            </View>
          );
        })}

        {filteredLogs.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No logs for this filter.</Text>
            <Text style={styles.emptySubText}>
              Start a project on the Home screen or enter a command below.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 4. Interactive Stdin Bar */}
      <View style={styles.stdinContainer}>
        <Text style={styles.promptChar}>❯</Text>
        <TextInput
          style={styles.stdinInput}
          value={inputCmd}
          onChangeText={setInputCmd}
          placeholder="Send stdin command to active process..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSendStdin}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendStdin}>
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  projectFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    marginRight: 8,
    letterSpacing: 0.5,
  },
  projectPillsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  projPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  projPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: colors.primary,
  },
  projPillIcon: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  projPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  projPillTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  streamBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceHighlight,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  streamTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  streamTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  streamTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  streamTabText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  streamTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  actionIconBtnActive: {
    backgroundColor: colors.primary,
  },
  actionIconText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
  },
  actionIconTextActive: {
    color: '#FFFFFF',
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: colors.terminalBg,
  },
  terminalContent: {
    padding: 12,
    paddingBottom: 24,
  },
  bootBanner: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 2,
  },
  bootBannerSub: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.terminalBorder,
    marginBottom: 10,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 1,
    flexWrap: 'wrap',
  },
  timestamp: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#475569',
    marginRight: 6,
    marginTop: 1,
  },
  projectTag: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: '#818CF8',
    marginRight: 6,
    marginTop: 1,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.terminalText,
    flex: 1,
    lineHeight: 16,
  },
  logStderr: {
    color: colors.error,
  },
  logSystem: {
    color: '#94A3B8',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  emptySubText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#475569',
  },
  stdinContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promptChar: {
    fontFamily: 'monospace',
    fontSize: 16,
    color: colors.primary,
    marginRight: 8,
    fontWeight: '700',
  },
  stdinInput: {
    flex: 1,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  sendBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
