import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityProvider } from '@/contexts/ActivityContext';
import { useChats } from '@/hooks/useChats';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useLocationPrompt } from '@/hooks/useLocationPrompt';
import { View, Text, StyleSheet, Platform, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActivityStore } from '@/store/useActivityStore';
import { router } from 'expo-router';

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

// Default bar on both platforms: icon on top, label below.

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
  locationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  locationModalBox: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  locationModalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  locationModalMessage: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  locationModalCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  locationModalCheckbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationModalCheckboxChecked: {
    backgroundColor: '#FF8C42',
    borderColor: '#FF8C42',
  },
  locationModalCheckboxLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  locationModalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  locationModalButtonSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  locationModalButtonSecondaryText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  locationModalButtonPrimary: {
    backgroundColor: '#FF8C42',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  locationModalButtonPrimaryText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default function TabLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    showLocationPrompt,
    isLocationRePrompt,
    dismissLocationPrompt,
    requestLocationThenDismiss,
  } = useLocationPrompt();
  const [locationDontAskAgain, setLocationDontAskAgain] = useState(false);

  useEffect(() => {
    if (showLocationPrompt) setLocationDontAskAgain(false);
  }, [showLocationPrompt]);

  // On Android, add bottom inset so the tab bar (icons + labels) sits above the system nav and isn't covered
  const tabBarBottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : 20;
  const tabBarHeight = Platform.OS === 'android' ? 85 + tabBarBottomPadding - 20 : 85;

  // Request notification permissions as soon as user is logged in
  useNotifications();

  const handleLocationNotNow = () => {
    dismissLocationPrompt(locationDontAskAgain);
  };

  const handleLocationTurnOn = () => {
    requestLocationThenDismiss(locationDontAskAgain);
  };

  return (
    <ActivityProvider>
        <Modal
          visible={showLocationPrompt}
          transparent
          animationType="fade"
        >
          <View style={styles.locationModalOverlay}>
            <View style={styles.locationModalBox}>
              <Text style={styles.locationModalTitle}>Turn on location?</Text>
              <Text style={styles.locationModalMessage}>
                Use your location to find people nearby and share where you are for meetups.
              </Text>
              {isLocationRePrompt && (
                <TouchableOpacity
                  style={styles.locationModalCheckboxRow}
                  onPress={() => setLocationDontAskAgain((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.locationModalCheckbox, locationDontAskAgain && styles.locationModalCheckboxChecked]}>
                    {locationDontAskAgain && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.locationModalCheckboxLabel}>Don't ask again</Text>
                </TouchableOpacity>
              )}
              <View style={styles.locationModalButtons}>
                <TouchableOpacity style={styles.locationModalButtonPrimary} onPress={handleLocationTurnOn}>
                  <Text style={styles.locationModalButtonPrimaryText}>Turn on</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.locationModalButtonSecondary} onPress={handleLocationNotNow}>
                  <Text style={styles.locationModalButtonSecondaryText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#FF8C42',
            tabBarInactiveTintColor: '#999',
            tabBarShowLabel: true,
            tabBarStyle: {
              backgroundColor: 'white',
              borderTopWidth: 1,
              borderTopColor: '#eee',
              paddingTop: 8,
              paddingBottom: tabBarBottomPadding,
              height: tabBarHeight,
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
              title: 'Home',
              tabBarIcon: ({ size, color }) => (
                <Ionicons name="home-outline" size={size} color={color} />
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
              listeners: {
                tabPress: () => {
                  router.navigate('/chats');
                },
              },
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
