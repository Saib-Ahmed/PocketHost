import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { Card } from '../components/Card';
import { ComingSoonBadge } from '../components/ComingSoonBadge';

export const DatabaseConfigScreen: React.FC = () => {
  const localDatabases = [
    {
      id: 'local-mongodb',
      name: 'Local MongoDB Engine',
      tagline: 'Embedded mongod daemon for ARM64',
      description: 'Run an isolated, native MongoDB instance directly on mobile storage without external network or Atlas credentials.',
      icon: 'MDB',
      port: 27017,
      status: 'In Development',
    },
    {
      id: 'local-postgres',
      name: 'Local PostgreSQL Engine',
      tagline: 'Embedded relational SQL database',
      description: 'Full ACID-compliant PostgreSQL server running locally in your isolated Android PRoot environment.',
      icon: 'PG',
      port: 5432,
      status: 'Planned',
    },
    {
      id: 'local-sqlite',
      name: 'Embedded SQLite Service',
      tagline: 'Zero-configuration serverless SQL',
      description: 'Ultra-lightweight SQLite file engine with built-in HTTP REST bridge for your mobile apps.',
      icon: 'SQL',
      port: 8082,
      status: 'Planned',
    },
    {
      id: 'local-redis',
      name: 'Local Redis Cache',
      tagline: 'In-memory key-value store',
      description: 'Sub-millisecond in-memory cache and session store for high-throughput mobile hosted services.',
      icon: 'REDIS',
      port: 6379,
      status: 'Planned',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Database Engines</Text>
        <Text style={styles.subtitle}>
          Embedded on-device database daemons for standalone mobile hosting.
        </Text>
      </View>

      {/* Cloud Databases Notice Banner */}
      <View style={styles.cloudNoticeBox}>
        <View style={styles.noticeTag}>
          <Text style={styles.noticeTagText}>NOTE</Text>
        </View>
        <View style={styles.cloudNoticeTextWrap}>
          <Text style={styles.cloudNoticeTitle}>Connecting to Cloud Databases (Atlas, Supabase, Neon)</Text>
          <Text style={styles.cloudNoticeDesc}>
            Cloud databases do not require local daemons. Set your connection string as an environment variable (e.g. <Text style={styles.code}>MONGODB_URI</Text> or <Text style={styles.code}>DATABASE_URL</Text>) in your project's Settings tab.
          </Text>
        </View>
      </View>

      {/* Local Embedded Engines List */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Embedded Local Engines</Text>
        <Text style={styles.sectionSubtitle}>
          Native ARM64 database processes running directly on Android
        </Text>
      </View>

      {localDatabases.map((db) => (
        <Card key={db.id} style={styles.dbCard}>
          <View style={styles.cardHeader}>
            <View style={styles.dbTitleRow}>
              <View style={styles.iconCircle}>
                <Text style={styles.dbIcon}>{db.icon}</Text>
              </View>
              <View>
                <Text style={styles.dbName}>{db.name}</Text>
                <Text style={styles.dbTagline}>{db.tagline}</Text>
              </View>
            </View>
            <ComingSoonBadge />
          </View>

          <Text style={styles.dbDesc}>{db.description}</Text>

          <View style={styles.dbFooter}>
            <View style={styles.portPill}>
              <Text style={styles.portLabel}>DEFAULT PORT</Text>
              <Text style={styles.portValue}>{db.port}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{db.status}</Text>
            </View>
          </View>
        </Card>
      ))}
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
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
  cloudNoticeBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  noticeTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 1,
  },
  noticeTagText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  cloudNoticeTextWrap: {
    flex: 1,
  },
  cloudNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A5B4FC',
    marginBottom: 4,
  },
  cloudNoticeDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  code: {
    fontFamily: 'monospace',
    color: '#38BDF8',
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dbCard: {
    padding: 15,
    marginBottom: 12,
    borderRadius: 14,
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dbTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 6,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dbIcon: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  dbName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dbTagline: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  dbDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginVertical: 8,
  },
  dbFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
    marginTop: 4,
  },
  portPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  portLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  portValue: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
  },
});
