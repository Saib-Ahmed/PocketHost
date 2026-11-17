import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Minimalist, professional line & geometric icons built with pure React Native primitives.
 * Zero external font/SVG dependencies, guaranteed cross-platform Hermes compatibility.
 */

// Home: 2x2 modular dashboard grid
export const IconHome: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const box = Math.round(size * 0.38);
  const gap = Math.round(size * 0.16);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap }}>
        <View style={{ width: box, height: box, borderRadius: 2, borderWidth: 1.5, borderColor: color }} />
        <View style={{ width: box, height: box, borderRadius: 2, borderWidth: 1.5, borderColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', gap, marginTop: gap }}>
        <View style={{ width: box, height: box, borderRadius: 2, borderWidth: 1.5, borderColor: color }} />
        <View style={{ width: box, height: box, borderRadius: 2, borderWidth: 1.5, borderColor: color }} />
      </View>
    </View>
  );
};

// Layers / Stacks: Two overlapping planes
export const IconStacks: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const w = Math.round(size * 0.78);
  const h = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          position: 'absolute',
          top: 2,
        }}
      />
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: '#0B0F19',
          position: 'absolute',
          bottom: 2,
        }}
      />
    </View>
  );
};

// Package / Box: Isometric-style minimalist box
export const IconPackage: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const boxW = Math.round(size * 0.76);
  const boxH = Math.round(size * 0.72);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: boxW,
          height: boxH,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View style={{ width: '100%', height: 1.2, backgroundColor: color }} />
        <View style={{ position: 'absolute', width: 1.2, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
};

// Terminal: >_ prompt
export const IconTerminal: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const w = Math.round(size * 0.88);
  const h = Math.round(size * 0.68);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          paddingLeft: 3,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color,
            fontSize: Math.round(size * 0.45),
            fontWeight: '800',
            fontFamily: 'monospace',
            lineHeight: Math.round(size * 0.5),
          }}
        >
          {'>_'}
        </Text>
      </View>
    </View>
  );
};

// Database: Stack of 3 cylinders
export const IconDatabase: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const w = Math.round(size * 0.75);
  const h = Math.round(size * 0.22);
  const gap = 2;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 1.5, borderColor: color }} />
      <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 1.5, borderColor: color, marginTop: gap }} />
      <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 1.5, borderColor: color, marginTop: gap }} />
    </View>
  );
};

// Settings / Sliders: Two adjustment tracks
export const IconSettings: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const trackW = Math.round(size * 0.76);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', gap: 4 }}>
      <View style={{ width: trackW, height: 1.5, backgroundColor: color, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            left: 2,
            top: -3,
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      </View>
      <View style={{ width: trackW, height: 1.5, backgroundColor: color, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            right: 2,
            top: -3,
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
};

// Play / Start triangle
export const IconPlay: React.FC<IconProps> = ({ size = 14, color = '#10B981' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: size * 0.4,
          borderBottomWidth: size * 0.4,
          borderLeftWidth: size * 0.65,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color,
          marginLeft: 2,
        }}
      />
    </View>
  );
};

// Stop / Square
export const IconStop: React.FC<IconProps> = ({ size = 12, color = '#EF4444' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: Math.round(size * 0.8),
          height: Math.round(size * 0.8),
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

// Refresh / Rotate
export const IconRefresh: React.FC<IconProps> = ({ size = 14, color = '#94A3B8' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: Math.round(size * 0.8),
          height: Math.round(size * 0.8),
          borderRadius: Math.round(size * 0.4),
          borderWidth: 1.5,
          borderColor: color,
          borderTopColor: 'transparent',
          position: 'relative',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: 0,
            width: 0,
            height: 0,
            borderLeftWidth: 3,
            borderRightWidth: 3,
            borderBottomWidth: 4,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
      </View>
    </View>
  );
};

// External link / Arrow up-right
export const IconExternalLink: React.FC<IconProps> = ({ size = 12, color = '#94A3B8' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color, fontSize: size, fontWeight: '700', lineHeight: size }}>↗</Text>
    </View>
  );
};

// Trash Can / Delete
export const IconTrash: React.FC<IconProps> = ({ size = 14, color = '#EF4444' }) => {
  const w = Math.round(size * 0.65);
  const h = Math.round(size * 0.7);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      {/* Lid */}
      <View style={{ width: w + 3, height: 1.5, backgroundColor: color, marginBottom: 1 }} />
      {/* Body */}
      <View
        style={{
          width: w,
          height: h,
          borderWidth: 1.2,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View style={{ width: 1, height: h - 3, backgroundColor: color }} />
      </View>
    </View>
  );
};

// Git branch icon
export const IconGit: React.FC<IconProps> = ({ size = 14, color = '#94A3B8' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text
        style={{
          color,
          fontSize: Math.round(size * 0.8),
          fontWeight: '800',
          fontFamily: 'monospace',
        }}
      >
        ⎇
      </Text>
    </View>
  );
};

// Checkmark
export const IconCheck: React.FC<IconProps> = ({ size = 12, color = '#10B981' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color, fontSize: size, fontWeight: '800', lineHeight: size }}>✓</Text>
    </View>
  );
};

// Plus / Add
export const IconPlus: React.FC<IconProps> = ({ size = 12, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color, fontSize: size, fontWeight: '700', lineHeight: size }}>+</Text>
    </View>
  );
};

// Close / Cross
export const IconClose: React.FC<IconProps> = ({ size = 12, color = '#94A3B8' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color, fontSize: size, fontWeight: '700', lineHeight: size }}>✕</Text>
    </View>
  );
};

// Metrics / Performance bars
export const IconMetrics: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => {
  const barW = Math.round(size * 0.18);
  const gap = Math.round(size * 0.12);
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap }}>
      <View style={{ width: barW, height: Math.round(size * 0.45), backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: barW, height: Math.round(size * 0.85), backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: barW, height: Math.round(size * 0.62), backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
};

// Terminal prompt char
export const IconPrompt: React.FC<IconProps> = ({ size = 13, color = '#6366F1' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color, fontSize: size, fontWeight: '800', fontFamily: 'monospace' }}>❯</Text>
    </View>
  );
};
