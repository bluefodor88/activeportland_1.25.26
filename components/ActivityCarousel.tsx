import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useActivityStore } from '@/store/useActivityStore';
import { useProfile } from '@/hooks/useProfile';
import { useActivities } from '@/hooks/useActivities';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = 70;
const ITEM_SPACING = 10;
const CENTER_OFFSET = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const UNREAD_STORAGE_KEY = (userId: string) => `forum_last_seen_${userId}`;

interface UserActivity {
  id: string;
  activity_id: string;
  skill_level: string;
  activities: {
    name: string;
    emoji: string;
  };
}

interface ActivityItem {
  id: string;
  activity_id: string;
  name: string;
  emoji: string;
  skill_level?: string;
}

export function ActivityCarousel() {
  const { activityId, setActivity } = useActivityStore();
  const { user } = useAuth();
  const { userSkills, loading: profileLoading, refetch } = useProfile();
  const { activities: allActivities, loading: activitiesLoading } = useActivities();

  const scrollViewRef = useRef<ScrollView>(null);
  const itemCentersRef = useRef<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Track scrolling state to prevent loops
  const isScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  // Only show "Loading activities..." on true first load, not when switching activities
  const hasLoadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Only refetch if user is logged in
      if (user) {
      refetch();
      }
    }, [refetch, user])
  );

  // When logged in: show user's activities
  // When not logged in: show all activities
  const displayActivities: ActivityItem[] = useMemo(() => {
    if (user) {
      // User is logged in - show their activities
    if (!userSkills || userSkills.length === 0) return [];
    const filtered = userSkills?.filter(
      (skill: any) => skill.activities
    ) as unknown as UserActivity[];
      return filtered.map(skill => ({
        id: skill.id,
        activity_id: skill.activity_id,
        name: skill.activities.name,
        emoji: skill.activities.emoji,
        skill_level: skill.skill_level,
      })).sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
    } else {
      // User is not logged in - show all activities
      if (!allActivities || allActivities.length === 0) return [];
      return allActivities.map(activity => ({
        id: activity.id,
        activity_id: activity.id,
        name: activity.name,
        emoji: activity.emoji,
      }));
    }
  }, [user, userSkills, allActivities]);

  if (displayActivities.length > 0) hasLoadedOnceRef.current = true;

  // Listen for Real-time database changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user_activity_skills_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_activity_skills',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [user, refetch]);

  // scroll calculation with offset
  const scrollToIndex = (index: number, animated = true) => {
    if (scrollViewRef.current) {
      isAutoScrollingRef.current = true;

      const knownCenter = itemCentersRef.current[index];
      const offset = typeof knownCenter === 'number'
        ? Math.max(0, knownCenter - SCREEN_WIDTH / 2)
        : index * (ITEM_WIDTH + ITEM_SPACING);

      scrollViewRef.current.scrollTo({
        x: offset,
        animated: animated,
      });

      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 500);
    }
  };

  const handlePressActivity = (index: number) => {
    if (index < 0 || index >= displayActivities.length) return;
    const selected = displayActivities[index];

    setCurrentIndex(index);
    scrollToIndex(index, true);

    setActivity({
      activityId: selected.activity_id,
      activity: selected.name,
      skillLevel: selected.skill_level || 'Beginner',
      emoji: selected.emoji,
    });
  };

  useEffect(() => {
    if (displayActivities.length === 0) return;

    const foundIndex = displayActivities.findIndex(
      (activity) => activity.activity_id === activityId
    );

    if (foundIndex >= 0) {
      if (foundIndex !== currentIndex && !isScrollingRef.current) {
        setCurrentIndex(foundIndex);
        scrollToIndex(foundIndex, false);
      }
    } else {
      // If current activity is not in the list, select the first one
      const firstActivity = displayActivities[0];
      if (firstActivity && activityId !== firstActivity.activity_id) {
        setCurrentIndex(0);
        scrollToIndex(0, false);
        setActivity({
          activityId: firstActivity.activity_id,
          activity: firstActivity.name,
          skillLevel: firstActivity.skill_level || 'Beginner',
          emoji: firstActivity.emoji,
        });
      }
    }
  }, [activityId, displayActivities, setActivity, currentIndex]);

  const handleScrollEnd = (event: any) => {
    if (displayActivities.length === 0) return;
    if (isAutoScrollingRef.current) return;

    isScrollingRef.current = true;
    const offsetX = event.nativeEvent.contentOffset.x;

    const rawIndex = Math.round(offsetX / (ITEM_WIDTH + ITEM_SPACING));
    const clampedIndex = Math.max(
      0,
      Math.min(rawIndex, displayActivities.length - 1)
    );

    if (clampedIndex !== currentIndex) {
      setCurrentIndex(clampedIndex);
      const selected = displayActivities[clampedIndex];
      setActivity({
        activityId: selected.activity_id,
        activity: selected.name,
        skillLevel: selected.skill_level || 'Beginner',
        emoji: selected.emoji,
      });
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  };

  const isLoading = user ? profileLoading : activitiesLoading;

  const loadUnreadCounts = useCallback(async () => {
    if (!user || displayActivities.length === 0) {
      setUnreadCounts({});
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(UNREAD_STORAGE_KEY(user.id));
      const lastSeenMap = stored ? JSON.parse(stored) : {};

      const counts: Record<string, number> = {};
      await Promise.all(
        displayActivities.map(async (activity) => {
          const lastSeen = lastSeenMap?.[activity.activity_id];
          let query = supabase
            .from('forum_messages')
            .select('id', { count: 'exact', head: true })
            .eq('activity_id', activity.activity_id);

          if (lastSeen) {
            query = query.gt('created_at', lastSeen);
          }
          if (user?.id) {
            query = query.neq('user_id', user.id);
          }

          const { count, error } = await query;
          counts[activity.activity_id] = error ? 0 : count || 0;
        })
      );

      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading unread counts:', error);
      setUnreadCounts({});
    }
  }, [user, displayActivities]);

  useFocusEffect(
    useCallback(() => {
      loadUnreadCounts();
    }, [loadUnreadCounts])
  );

  useEffect(() => {
    loadUnreadCounts();
  }, [activityId, loadUnreadCounts]);

  useEffect(() => {
    if (!activityId) return;
    setUnreadCounts((prev) => ({ ...prev, [activityId]: 0 }));
  }, [activityId]);

  if (isLoading && displayActivities.length === 0 && !hasLoadedOnceRef.current) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading activities...</Text>
        </View>
      </View>
    );
  }

  if (displayActivities.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {user ? 'No activities selected' : 'No activities available'}
          </Text>
          <Text style={styles.emptySubtext}>
            {user 
              ? 'Add activities from your Profile tab'
              : 'Please try again later'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        // This makes it snap to the center of each item
        snapToInterval={ITEM_WIDTH + ITEM_SPACING}
        decelerationRate="fast"
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        bounces={true}
      >
        {/* Spacer at start */}
        <View style={{ width: CENTER_OFFSET }} />

        {displayActivities.map((activity, index) => {
          const isSelected = index === currentIndex;
          const unreadCount = unreadCounts[activity.activity_id] || 0;
          return (
            <TouchableOpacity
              key={`${activity.id}-${activity.activity_id}`}
              style={styles.itemContainer}
              activeOpacity={0.8}
              onPress={() => handlePressActivity(index)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                itemCentersRef.current[index] = x + width / 2;
              }}
            >
              <View
                style={[
                  styles.activityItem,
                  isSelected && styles.activityItemSelected,
                  { opacity: isSelected ? 1 : 0.35 },
                ]}
              >
                <Text style={styles.emoji}>
                  {activity.emoji}
                </Text>
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.activityName,
                  isSelected && styles.activityNameSelected,
                ]}
                numberOfLines={1}
              >
                {activity.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Spacer at end */}
        <View style={{ width: CENTER_OFFSET }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemContainer: {
    width: ITEM_WIDTH,
    marginHorizontal: ITEM_SPACING / 2,
    alignItems: 'center',
  },
  activityItem: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    borderRadius: 18,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  unreadBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  activityItemSelected: {
    backgroundColor: '#fff5e6',
  },
  emoji: {
    fontSize: 36,
  },
  activityName: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#999',
    textAlign: 'center',
  },
  activityNameSelected: {
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
});
