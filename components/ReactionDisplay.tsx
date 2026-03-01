import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ReactionSummary } from '@/hooks/useMessageReactions';

interface ReactionDisplayProps {
  reactions: ReactionSummary[];
  currentUserEmoji: string | null;
  /** When true, no top margin (e.g. for chat bubble corner) */
  compact?: boolean;
  /** When provided, tapping your own reaction removes it */
  onRemoveReaction?: (emoji: string) => void;
}

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export function ReactionDisplay({
  reactions,
  currentUserEmoji,
  compact = false,
  onRemoveReaction,
}: ReactionDisplayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {reactions.map((r) => {
        const isMine = currentUserEmoji === r.emoji;
        const canRemove = isMine && onRemoveReaction;
        const handleRemove = () => {
          if (canRemove) onRemoveReaction(r.emoji);
        };
        const PillWrapper = canRemove ? TouchableOpacity : View;
        return (
          <PillWrapper
            key={r.emoji}
            style={styles.pill}
            onPress={canRemove ? handleRemove : undefined}
            activeOpacity={canRemove ? 0.6 : 1}
            hitSlop={canRemove ? HIT_SLOP : undefined}
            accessible={canRemove}
            accessibilityRole={canRemove ? 'button' : undefined}
            accessibilityLabel={canRemove ? `Remove ${r.emoji} reaction` : undefined}
          >
            <View style={styles.pillInner}>
              <Text style={styles.emoji}>{r.emoji}</Text>
              {r.count > 1 && (
                <Text style={styles.count}>{r.count}</Text>
              )}
            </View>
          </PillWrapper>
        );
      })}
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
    minHeight: 36,
    justifyContent: 'center',
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
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
