import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { IconPackage } from '../components/Icons';

interface DependencySetupScreenProps {
  onSetupComplete: () => void;
}

export const DependencySetupScreen: React.FC<DependencySetupScreenProps> = ({
  onSetupComplete,
}) => {
  const { isBootstrapReady, bootstrapProgress, initializeBootstrap, activeStack } = useApp();
  const [loading, setLoading] = useState(false);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      await initializeBootstrap();
      onSetupComplete();
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      id: 'proot',
      title: 'Isolated Linux Userland',
      desc: 'Sandboxed PRoot layer running inside app files',
      done: isBootstrapReady || (bootstrapProgress?.percentage ?? 0) >= 25,
      current: (bootstrapProgress?.percentage ?? 0) < 25 && loading,
    },
    {
      id: 'dns',
      title: 'Network Resolvers & Hosts',
      desc: 'Setting up DNS (1.1.1.1, 8.8.8.8) for package downloads',
      done: isBootstrapReady || (bootstrapProgress?.percentage ?? 0) >= 50,
      current: (bootstrapProgress?.percentage ?? 0) >= 25 && (bootstrapProgress?.percentage ?? 0) < 50,
    },
    {
      id: 'runtime',
      title: `${activeStack.name} Runtime`,
      desc: `Packages: ${activeStack.requiredPackages.join(', ')}`,
      done: isBootstrapReady || (bootstrapProgress?.percentage ?? 0) >= 75,
      current: (bootstrapProgress?.percentage ?? 0) >= 50 && (bootstrapProgress?.percentage ?? 0) < 75,
    },
    {
      id: 'tunnels',
      title: 'Networking & Tunnels',
      desc: 'Cloudflare Quick Tunnel & zrok integration ready',
      done: isBootstrapReady || (bootstrapProgress?.percentage ?? 0) >= 100,
      current: (bootstrapProgress?.percentage ?? 0) >= 75 && (bootstrapProgress?.percentage ?? 0) < 100,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <IconPackage size={24} color={colors.primary} />
        </View>
        <Text style={styles.title}>Environment Setup</Text>
        <Text style={styles.subtitle}>
          Preparing dependencies for {activeStack.name}. Everything runs in a zero-root sandbox directly on your Android device.
        </Text>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Setup Status</Text>
          <Badge
            label={isBootstrapReady ? 'READY' : loading ? 'INSTALLING...' : 'PENDING'}
            color={isBootstrapReady ? colors.success : colors.warning}
            bgColor={isBootstrapReady ? colors.successMuted : colors.warningMuted}
          />
        </View>

        {/* Visual Progress Bar */}
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${isBootstrapReady ? 100 : bootstrapProgress?.percentage || 5}%` },
            ]}
          />
        </View>

        {bootstrapProgress?.message && (
          <Text style={styles.progressMessage}>
            {bootstrapProgress.message}
          </Text>
        )}
      </Card>

      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={step.id} style={styles.stepItem}>
            <View style={styles.stepIndicator}>
              {step.done ? (
                <View style={styles.doneCircle}>
                  <Text style={styles.doneCheck}>✓</Text>
                </View>
              ) : step.current ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={styles.pendingCircle}>
                  <Text style={styles.pendingNumber}>{index + 1}</Text>
                </View>
              )}
              {index < steps.length - 1 && <View style={styles.stepLine} />}
            </View>

            <View style={styles.stepTextContent}>
              <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>
                {step.title}
              </Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {!isBootstrapReady ? (
          <Button
            title={loading ? 'Configuring Environment...' : 'Install Dependencies'}
            onPress={handleStartSetup}
            loading={loading}
            icon="→"
          />
        ) : (
          <Button
            title="Continue to Project Setup"
            onPress={onSetupComplete}
            variant="success"
            icon="→"
          />
        )}
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
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  progressCard: {
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceHighlight,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 10,
  },
  stepsContainer: {
    marginBottom: 24,
  },
  stepItem: {
    flexDirection: 'row',
    minHeight: 56,
  },
  stepIndicator: {
    alignItems: 'center',
    width: 32,
    marginRight: 12,
  },
  doneCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pendingCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingNumber: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 4,
  },
  stepTextContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepTitleDone: {
    color: colors.success,
  },
  stepDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    marginTop: 10,
  },
});
