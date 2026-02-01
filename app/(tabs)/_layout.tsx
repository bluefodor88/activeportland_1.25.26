import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityProvider } from '@/contexts/ActivityContext';
import { MeetingReminderProvider } from '@/contexts/MeetingReminderContext';
import { useChats } from '@/hooks/useChats';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { View, Text, StyleSheet } from 'react-native';

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
});

export default function TabLayout() {
  const { user } = useAuth();
  
  // Request notification permissions as soon as user is logged in
  useNotifications();

  return (
    <ActivityProvider>
      <MeetingReminderProvider>
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
                <Ionicons name="chatbubbles-outline" size={size} color={color} />
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
      </MeetingReminderProvider>
    </ActivityProvider>
  );
}