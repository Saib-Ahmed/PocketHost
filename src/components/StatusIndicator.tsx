import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { ProjectStatus } from '../types/project';

interface StatusIndicatorProps {
  status: ProjectStatus;
  size?: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, size = 10 }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'RUNNING' || status === 'BUILDING') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  const getColor = () => {
    switch (status) {
      case 'RUNNING':
        return colors.success;
      case 'BUILDING':
      case 'STARTING':
        return colors.warning;
      case 'FAILED':
        return colors.error;
      default:
        return colors.textMuted;
    }
  };

  const color = getColor();

  return (
    <View style={[styles.container, { width: size * 2, height: size * 2 }]}>
      {(status === 'RUNNING' || status === 'BUILDING') && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: size * 1.8,
              height: size * 1.8,
              borderRadius: (size * 1.8) / 2,
              backgroundColor: color,
              transform: [{ scale: pulseAnim }],
              opacity: 0.35,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.coreDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
  },
  coreDot: {
    zIndex: 1,
  },
});
