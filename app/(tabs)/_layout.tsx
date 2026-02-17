import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityProvider } from '@/contexts/ActivityContext';
import { useChats } from '@/hooks/useChats';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { View, Text, StyleSheet } from 'react-native';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActivityStore } from '@/store/useActivityStore';

const FORUM_UNREAD_KEY = (userId: string) => `forum_last_seen_${userId}`;

function ChatTabIcon({ size, color }: { size: number; color: string }) {
  const { chats } = useChats();
  const unreadChatCount = chats.filter(chat => chat.unreadCount > 0).length;

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name="chatbubble-outline" size={size} color={color} />
      {unreadChatCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>
            {unreadChatCount > 99 ? '99+' : unreadChatCount.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

function ForumTabIcon({ size, color }: { size: number; color: string }) {
  const { user } = useAuth();
  const { userSkills } = useProfile();
  const { forumLastSeenVersion } = useActivityStore();
  const [unreadTotal, setUnreadTotal] = useState(0);

  const loadUnreadTotal = useCallback(async () => {
    if (!user) {
      setUnreadTotal(0);
      return;
    }

    const activities = (userSkills || [])
      .filter((skill: any) => skill.activities)
      .map((skill: any) => skill.activity_id);

    if (activities.length === 0) {
      setUnreadTotal(0);
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(FORUM_UNREAD_KEY(user.id));
      const lastSeenMap = stored ? JSON.parse(stored) : {};

      let total = 0;
      await Promise.all(
        activities.map(async (activityId: string) => {
          const lastSeen = lastSeenMap?.[activityId];
          let query = supabase
            .from('forum_messages')
            .select('id', { count: 'exact', head: true })
            .eq('activity_id', activityId);

          if (lastSeen) {
            query = query.gt('created_at', lastSeen);
          }
          query = query.neq('user_id', user.id);

          const { count, error } = await query;
          if (!error && count) total += count;
        })
      );

      setUnreadTotal(total);
    } catch (error) {
      console.error('Error loading forum unread total:', error);
      setUnreadTotal(0);
    }
  }, [user, userSkills]);

  useFocusEffect(
    useCallback(() => {
      loadUnreadTotal();
    }, [loadUnreadTotal])
  );

  useEffect(() => {
    loadUnreadTotal();
  }, [loadUnreadTotal, forumLastSeenVersion]);

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name="chatbubbles-outline" size={size} color={color} />
      {unreadTotal > 0 && (
        <View style={styles.forumUnreadBadge}>
          <Text style={styles.unreadText}>
            {unreadTotal > 99 ? '99+' : unreadTotal.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF8C42',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  unreadText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  forumUnreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
});

export default function TabLayout() {
  const { user } = useAuth();
  
  // Request notification permissions as soon as user is logged in
  useNotifications();

  return (
    <ActivityProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#FF8C42',
            tabBarInactiveTintColor: '#999',
            tabBarStyle: {
              backgroundColor: 'white',
              borderTopWidth: 1,
              borderTopColor: '#eee',
              paddingTop: 8,
              paddingBottom: 20,
              height: 85,
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontFamily: 'Inter_500Medium',
              marginTop: 2,
              marginBottom: 4,
            },
            tabBarIconStyle: {
              marginTop: 8,
              marginBottom: 0,
            },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              href: null, // Hide from tab bar
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ size, color }) => (
                <Ionicons name="person-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="forum"
            options={{
              title: 'Forum',
              tabBarIcon: ({ size, color }) => (
                <ForumTabIcon size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="people"
            options={{
              title: 'People',
              tabBarIcon: ({ size, color }) => (
                <Ionicons name="people-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: 'Chats',
              tabBarIcon: ({ size, color }) => (
                <ChatTabIcon size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="people/[id]"
            options={{
              href: null, // Hide from tab bar but keep navigation visible
            }}
          />
        </Tabs>
    </ActivityProvider>
  );
}
