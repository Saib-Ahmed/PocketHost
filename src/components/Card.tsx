import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, style, active, onPress }) => {
  const cardStyle = [
    styles.card,
    active && styles.activeCard,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        activeOpacity={0.8}
        onPress={onPress}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  activeCard: {
    borderColor: colors.cardBorderActive,
    backgroundColor: colors.surfaceHighlight,
  },
});
