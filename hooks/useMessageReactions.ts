import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export type MessageType = 'forum' | 'chat';

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export function useMessageReactions(
  messageIds: string[],
  messageType: MessageType
) {
  const { user } = useAuth();
  const [reactionsByMessageId, setReactionsByMessageId] = useState<
    Record<string, ReactionSummary[]>
  >({});
  const [loading, setLoading] = useState(false);

  const fetchReactions = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setReactionsByMessageId({});
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('message_id, user_id, emoji')
          .eq('message_type', messageType)
          .in('message_id', ids);

        if (error) {
          console.error('Error fetching reactions:', error);
          setLoading(false);
          return;
        }

        const byMessage: Record<string, ReactionSummary[]> = {};
        ids.forEach((id) => {
          byMessage[id] = [];
        });
        (data || []).forEach((row: { message_id: string; user_id: string; emoji: string }) => {
          const id = row.message_id;
          if (!byMessage[id]) byMessage[id] = [];
          const existing = byMessage[id].find((r) => r.emoji === row.emoji);
          if (existing) {
            existing.count += 1;
            existing.userIds.push(row.user_id);
          } else {
            byMessage[id].push({
              emoji: row.emoji,
              count: 1,
              userIds: [row.user_id],
            });
          }
        });
        setReactionsByMessageId((prev) => ({ ...prev, ...byMessage }));
      } finally {
        setLoading(false);
      }
    },
    [messageType]
  );

  useEffect(() => {
    fetchReactions(messageIds);
  }, [messageIds.join(','), fetchReactions]);

  // Realtime: when any reaction changes for this type, refetch that message's reactions
  useEffect(() => {
    if (messageIds.length === 0) return;

    const channel = supabase
      .channel(`message_reactions_${messageType}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_type=eq.${messageType}`,
        },
        (payload: { new?: { message_id: string }; old?: { message_id: string } }) => {
          const id = payload.new?.message_id ?? payload.old?.message_id;
          if (id && messageIds.includes(id)) fetchReactions([id]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageType, messageIds.join(','), fetchReactions]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string): Promise<boolean> => {
      if (!user) return false;

      try {
        const { data: existing } = await supabase
          .from('message_reactions')
          .select('id, emoji')
          .eq('message_id', messageId)
          .eq('message_type', messageType)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          if (existing.emoji === emoji) {
            const { error: delError } = await supabase
              .from('message_reactions')
              .delete()
              .eq('id', existing.id);
            if (delError) {
              console.error('Delete reaction error:', delError);
              return false;
            }
            // Optimistic update: remove this user's reaction from UI immediately (fixes Android not updating until refresh)
            setReactionsByMessageId((prev) => {
              const list = prev[messageId] ?? [];
              const next = list
                .map((r) => {
                  if (r.emoji !== emoji || !r.userIds.includes(user.id)) return r;
                  if (r.count <= 1) return null;
                  return {
                    ...r,
                    count: r.count - 1,
                    userIds: r.userIds.filter((id) => id !== user.id),
                  };
                })
                .filter((r): r is ReactionSummary => r !== null);
              return { ...prev, [messageId]: next };
            });
          } else {
            const { error: updError } = await supabase
              .from('message_reactions')
              .update({ emoji })
              .eq('id', existing.id);
            if (updError) {
              console.error('Update reaction error:', updError);
              return false;
            }
            // Optimistic: move user from old emoji pill to new one
            setReactionsByMessageId((prev) => {
              const list = prev[messageId] ?? [];
              const withoutMe = list
                .map((r) => {
                  if (!r.userIds.includes(user.id)) return r;
                  if (r.count <= 1) return null;
                  return { ...r, count: r.count - 1, userIds: r.userIds.filter((id) => id !== user.id) };
                })
                .filter((r): r is ReactionSummary => r !== null);
              const existingNew = withoutMe.find((r) => r.emoji === emoji);
              const next = existingNew
                ? withoutMe.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, user.id] } : r))
                : [...withoutMe, { emoji, count: 1, userIds: [user.id] }];
              return { ...prev, [messageId]: next };
            });
          }
        } else {
          const { error } = await supabase.from('message_reactions').insert({
            message_id: messageId,
            message_type: messageType,
            user_id: user.id,
            emoji,
          });
          if (error) {
            console.error('Insert reaction error:', error);
            return false;
          }
          // Optimistic: add new reaction pill or increment
          setReactionsByMessageId((prev) => {
            const list = prev[messageId] ?? [];
            const existingPill = list.find((r) => r.emoji === emoji);
            const next = existingPill
              ? list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, user.id] } : r))
              : [...list, { emoji, count: 1, userIds: [user.id] }];
            return { ...prev, [messageId]: next };
          });
        }
        // Refetch to stay in sync with server (realtime may be delayed on Android)
        await fetchReactions([messageId]);
        return true;
      } catch (e) {
        console.error('Toggle reaction error:', e);
        return false;
      }
    },
    [user, messageType, fetchReactions]
  );

  const getReactions = useCallback(
    (messageId: string): ReactionSummary[] => {
      return reactionsByMessageId[messageId] ?? [];
    },
    [reactionsByMessageId]
  );

  const getCurrentUserEmoji = useCallback(
    (messageId: string): string | null => {
      if (!user) return null;
      const list = reactionsByMessageId[messageId] ?? [];
      const r = list.find((x) => x.userIds.includes(user.id));
      return r?.emoji ?? null;
    },
    [user, reactionsByMessageId]
  );

  return {
    getReactions,
    getCurrentUserEmoji,
    toggleReaction,
    loading,
  };
}
