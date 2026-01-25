import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SectionList,
  StyleSheet,
  Image,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { usePeople } from '@/hooks/usePeople';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { getOrCreateChat } from '@/hooks/useChats';
import { useAuth } from '@/hooks/useAuth';
import { requireAuth } from '@/lib/authHelpers';
import { ActivityCarousel } from '@/components/ActivityCarousel';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ICONS } from '@/lib/helperUtils';
import { supabase } from '@/lib/supabase';


export default function PeopleScreen() {
  const { user } = useAuth();
  const { requestLocationPermission } = useLocationTracking();

  const [refreshing, setRefreshing] = useState(false);

  const { people, loading, refetch } = usePeople();

  // Split people into "Ready Today" and "Others" sections
  const sections = useMemo(() => {
    const readyToday = people.filter(p => p.ready_today === true);
    const others = people.filter(p => !p.ready_today || p.ready_today === false);

    const sections = [];
    
    // Always show "Ready Today" section, even if empty
    sections.push({
      title: 'Ready Today',
      data: readyToday,
    });
    
    // Only show "Others" section if there are people
    if (others.length > 0) {
      sections.push({
        title: 'Others',
        data: others,
      });
    }

    return sections;
  }, [people]);

  const onRefresh = async () => {
    setRefreshing(true);
    
    // 1. Check permissions and get latest location
    await requestLocationPermission();
    
    // 2. Reload the list
    await refetch();
    
    setRefreshing(false);
  };

  const openChat = async (userId: string, userName: string) => {
    // Require login for messaging
    if (!user) {
      requireAuth('message users');
      return;
    }
    
    try {
      const chatId = await getOrCreateChat(user.id, userId);
      if (chatId) {
        router.push({
          pathname: '/chat/[id]',
          params: { id: userId, name: userName },
        });
      }
    } catch (error) {
      console.error('Error opening chat:', error);
    }
  };

  const getSkillColor = (skillLevel: string) => {
    switch (skillLevel) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FFCF56';
      case 'Advanced':
        return '#FF6B35';
      default:
        return '#999';
    }
  };

  const handleReportUser = (userId: string, userName: string) => {
    // Require login for reporting
    if (!user) {
      requireAuth('report users');
      return;
    }

    Alert.alert(
      'Report User',
      `Report ${userName} for inappropriate behavior?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            // Open email with pre-filled subject
            const email = 'activityhubsercive@gmail.com';
            const subject = encodeURIComponent(`Report User - ${userId}`);
            const body = encodeURIComponent(`I would like to report user ${userName} (ID: ${userId}) for the following reason:\n\n`);
            const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
            
            Linking.canOpenURL(mailtoLink).then(supported => {
              if (supported) {
                Linking.openURL(mailtoLink);
              } else {
                Alert.alert('Error', 'Please email activityhubsercive@gmail.com with subject: "Report User - ' + userId + '"');
              }
            });
          }
        }
      ]
    );
  };

  const handleBlockUser = async (userId: string, userName: string) => {
    // Require login for blocking
    if (!user) {
      requireAuth('block users');
      return;
    }

    Alert.alert(
      'Block User',
      `Block ${userName}? This will:\n• Hide all chats with this user\n• Disable messaging\n• Remove them from your people list`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              // Create a blocked_users record (or update if exists)
              const { error } = await supabase
                .from('blocked_users')
                .upsert({
                  user_id: user.id,
                  blocked_user_id: userId,
                  created_at: new Date().toISOString(),
                }, {
                  onConflict: 'user_id,blocked_user_id'
                });

              if (error) {
                console.error('Error blocking user:', error);
                Alert.alert('Error', 'Failed to block user. Please try again.');
              } else {
                Alert.alert('User Blocked', `${userName} has been blocked.`);
                // Refresh the people list to remove blocked user
                refetch();
              }
            } catch (error) {
              console.error('Error blocking user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          }
        }
      ]
    );
  };

  const renderUser = ({ item }: { item: any }) => (
    <View style={styles.userCard}>
      <Image source={ item?.avatar_url ? { uri: item.avatar_url } : ICONS.profileIcon } style={styles.avatar} />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{item.name}</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => handleReportUser(item.id, item.name)}
            >
              <Ionicons name="flag-outline" size={16} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.blockButton}
              onPress={() => handleBlockUser(item.id, item.name)}
            >
              <Ionicons name="ban-outline" size={16} color="#F44336" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.skillContainer}>
          <View style={[styles.skillBadge, { backgroundColor: getSkillColor(item.skill_level) }]}>
            <Text style={styles.skillText}>{item.skill_level}</Text>
          </View>
        </View>
        <View style={styles.distanceContainer}>
          <Ionicons name="location" size={14} color="#666" />
          <Text style={styles.distanceText}>{item.distance}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.chatButton}
        onPress={() => {
          openChat(item.id, item.name);
        }}
      >
        <Ionicons name="chatbubble" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityCarousel />
        <View style={styles.loadingContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading people...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ActivityCarousel />

      <View style={styles.header}>
        <View style={styles.headerGradient} />
        <View style={styles.headerTop}>
          <Text style={styles.title}>
            People Nearby
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderUser}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.title === 'Ready Today' && (
              <View style={styles.readyTodayBadge}>
                <Text style={styles.readyTodayBadgeText}>{section.data.length}</Text>
              </View>
            )}
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#FF8C42']} // Android spinner color
            tintColor="#FF8C42"  // iOS spinner color
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No people found</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to join this activity community!
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#FF8C42',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textShadowColor: 'rgba(255, 140, 66, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  readyTodayBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  readyTodayBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
    transform: [{ scale: 1 }],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportButton: {
    padding: 4,
  },
  blockButton: {
    padding: 4,
  },
  skillContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  skillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginLeft: 4,
  },
  chatButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
  },
  locationButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  locationButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#1565C0',
    textAlign: 'center',
  },
});