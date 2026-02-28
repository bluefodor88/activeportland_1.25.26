import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ReactionSummary } from '@/hooks/useMessageReactions';

interface ReactionDisplayProps {
  reactions: ReactionSummary[];
  currentUserEmoji: string | null;
  /** When true, no top margin (e.g. for chat bubble corner) */
  compact?: boolean;
}

export function ReactionDisplay({
  reactions,
  currentUserEmoji,
  compact = false,
}: ReactionDisplayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {reactions.map((r) => (
        <View key={r.emoji} style={styles.pill}>
          <Text style={styles.emoji}>{r.emoji}</Text>
          {r.count > 1 && (
            <Text style={styles.count}>{r.count}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  containerCompact: {
    marginTop: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  emoji: {
    fontSize: 18,
  },
  count: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    marginLeft: 2,
  },
});
