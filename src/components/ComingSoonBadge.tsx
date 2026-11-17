import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const ComingSoonBadge: React.FC = () => {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>COMING SOON</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
