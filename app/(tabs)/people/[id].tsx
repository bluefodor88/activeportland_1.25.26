import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ICONS } from '@/lib/helperUtils';
import { useAvailability } from '@/hooks/useAvailability';
import { useAuth } from '@/hooks/useAuth';

type ActivityItem = {
  id: string;
  name: string;
  emoji: string | null;
  skill_level: string;
  ready_today: boolean;
};

export default function PersonDetailsScreen() {
  const { id, name, from, fromChatUserId, fromChatName } = useLocalSearchParams<{
    id: string;
    name?: string;
    from?: string;
    fromChatUserId?: string;
    fromChatName?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const { availability, loading: availabilityLoading, DAYS_OF_WEEK, TIME_BLOCKS } = useAvailability(id);
  const { user } = useAuth();
  const [safetyAction, setSafetyAction] = useState<'report' | 'block' | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .eq('id', id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
        }

        // Fetch activities for this user
        const { data: skillsData, error: skillsError } = await supabase
          .from('user_activity_skills')
          .select(`
            id,
            activity_id,
            skill_level,
            ready_today,
            activities (
              name,
              emoji
            )
          `)
          .eq('user_id', id);

        if (skillsError) {
          console.error('Error fetching user activities:', skillsError);
          setActivities([]);
        } else {
          const mapped: ActivityItem[] =
            (skillsData || [])
              .filter((item: any) => item.activities)
              .map((item: any) => ({
                id: item.id,
                name: item.activities.name,
                emoji: item.activities.emoji || null,
                skill_level: item.skill_level,
                ready_today: !!item.ready_today,
              }))
              .sort((a, b) => a.name.localeCompare(b.name));

          setActivities(mapped);
        }
      } catch (error) {
        console.error('Unexpected error fetching person details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const displayName = profile?.name || name || 'ActivityHub member';

  const performReportUser = () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to report users.');
      return;
    }
    const userId = id;
    const userName = displayName || 'User';

    const email = 'activityhubsercive@gmail.com';
    const subject = encodeURIComponent(`Report User - ${userId}`);
    const body = encodeURIComponent(
      `I would like to report user ${userName} (ID: ${userId}) for the following reason:\n\n`
    );
    const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
    Linking.canOpenURL(mailtoLink).then(supported => {
      if (supported) {
        Linking.openURL(mailtoLink);
      } else {
        Alert.alert(
          'Error',
          `Please email ${email} with subject: "Report User - ${userId}"`
        );
      }
    });
  };

  const performBlockUser = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to block users.');
      return;
    }
    const userId = id;
    const userName = displayName || 'User';

    try {
      const { error } = await supabase
        .from('blocked_users')
        .upsert(
          {
            user_id: user.id,
            blocked_user_id: userId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,blocked_user_id' }
        );

      if (error) {
        console.error('Error blocking user:', error);
        Alert.alert('Error', 'Failed to block user. Please try again.');
      } else {
        Alert.alert('User Blocked', `${userName} has been blocked.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error blocking user:', error);
      Alert.alert('Error', 'Failed to block user. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (from === 'chat' && fromChatUserId) {
              router.push({
                pathname: '/chat/[id]',
                params: { id: fromChatUserId, name: fromChatName || name || '' },
              });
              return;
            }
            if (from === 'people') {
              router.push('/(tabs)/people');
              return;
            }
            if (from === 'forum') {
              router.push('/(tabs)/forum');
              return;
            }
            router.back();
          }}
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C42" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <Image
              source={
                profile?.avatar_url
                  ? { uri: profile.avatar_url }
                  : ICONS.profileIcon
              }
              style={styles.avatarLarge}
            />
            <Text style={styles.name}>{displayName}</Text>
          </View>

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Availability</Text>
            {availabilityLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 16 }} />
            ) : (
              <View style={styles.availabilityContainer}>
                {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                  const daySlots = availability.filter(
                    (slot) => slot.day_of_week === dayIndex
                  );
                  const hasAnyEnabled = daySlots.some((slot) => slot.enabled);
                  
                  if (!hasAnyEnabled) return null; // Skip days with no availability
                  
                  return (
                    <View key={dayIndex} style={styles.availabilityDayRow}>
                      <Text style={styles.availabilityDayLabel}>
                        {dayName.substring(0, 3)}
                      </Text>
                      <View style={styles.availabilityTimeBlocks}>
                        {TIME_BLOCKS.map((timeBlock) => {
                          const slot = daySlots.find(
                            (s) => s.time_block === timeBlock
                          );
                          const isEnabled = slot?.enabled || false;
                          const timeBlockLabel = timeBlock.charAt(0).toUpperCase() + timeBlock.slice(1);
                          return (
                            <View
                              key={timeBlock}
                              style={[
                                styles.availabilityBlock,
                                isEnabled && styles.availabilityBlockEnabled,
                              ]}
                            >
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color={isEnabled ? 'white' : '#999'}
                                style={styles.availabilityCheckmark}
                              />
                              <Text
                                style={[
                                  styles.availabilityBlockText,
                                  isEnabled && styles.availabilityBlockTextEnabled,
                                ]}
                              >
                                {timeBlockLabel}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                {availability.filter((slot) => slot.enabled).length === 0 && (
                  <Text style={styles.emptyText}>
                    No availability preferences set.
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Activities</Text>
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>
                No activities selected yet.
              </Text>
            ) : (
              activities.map((activity, index) => (
                <View
                  key={activity.id}
                  style={[
                    styles.activityRow,
                    index === activities.length - 1 && styles.activityRowLast,
                  ]}
                >
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityEmoji}>
                      {activity.emoji || '🏃'}
                    </Text>
                    <View style={styles.activityTextContainer}>
                      <Text style={styles.activityName}>{activity.name}</Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.skillBadge, getSkillBadgeStyle(activity.skill_level)]}>
                          <Text style={styles.skillBadgeText}>
                            {activity.skill_level}
                          </Text>
                        </View>
                        {activity.ready_today && (
                          <View style={styles.readyBadge}>
                            <Text style={styles.readyBadgeText}>Ready today</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.safetyRow}>
            <TouchableOpacity style={styles.safetyButton} onPress={() => setSafetyAction('report')}>
              <Ionicons name="flag-outline" size={18} color="#666" />
              <Text style={styles.safetyText}>Report user</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.safetyButton, styles.safetyButtonDanger]} onPress={() => setSafetyAction('block')}>
              <Ionicons name="ban-outline" size={18} color="#D32F2F" />
              <Text style={[styles.safetyText, styles.safetyTextDanger]}>Block user</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      <Modal
        visible={!!safetyAction}
        transparent
        animationType="fade"
        onRequestClose={() => setSafetyAction(null)}
      >
        <View style={styles.safetyModalOverlay}>
          <View style={styles.safetyModalCard}>
            <Text style={styles.safetyModalTitle}>
              {safetyAction === 'block' ? 'Block this user?' : 'Report this user?'}
            </Text>
            <Text style={styles.safetyModalBody}>
              {safetyAction === 'block'
                ? 'Are you sure you want to block this user?'
                : 'Are you sure you want to report this user?'}
            </Text>
            <View style={styles.safetyModalActions}>
              <TouchableOpacity
                style={[styles.safetyModalButton, styles.safetyModalCancel]}
                onPress={() => setSafetyAction(null)}
              >
                <Text style={styles.safetyModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.safetyModalButton, styles.safetyModalConfirm]}
                onPress={async () => {
                  const action = safetyAction;
                  setSafetyAction(null);
                  if (action === 'block') {
                    await performBlockUser();
                  } else {
                    performReportUser();
                  }
                }}
              >
                <Text style={styles.safetyModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getSkillBadgeStyle(skillLevel: string) {
  switch (skillLevel) {
    case 'Beginner':
      return { backgroundColor: '#4CAF50' };
    case 'Intermediate':
      return { backgroundColor: '#FFCF56' };
    case 'Advanced':
      return { backgroundColor: '#FF6B35' };
    default:
      return { backgroundColor: '#999' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: 'white',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarLarge: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 16,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionGap: {
    marginTop: 12,
  },
  safetyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 16,
  },
  safetyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  safetyButtonDanger: {
    borderColor: '#F2C5C5',
    backgroundColor: '#FFF5F5',
  },
  safetyText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  safetyTextDanger: {
    color: '#D32F2F',
  },
  safetyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  safetyModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  safetyModalTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  safetyModalBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
  safetyModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  safetyModalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyModalCancel: {
    backgroundColor: '#FDEDED',
    borderWidth: 1,
    borderColor: '#F2C5C5',
  },
  safetyModalConfirm: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  safetyModalCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D32F2F',
  },
  safetyModalConfirmText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#2E7D32',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  activityRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityRowLast: {
    borderBottomWidth: 0,
  },
  activityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  activityTextContainer: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  readyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  readyBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#388E3C',
  },
  availabilityContainer: {
    marginTop: 8,
  },
  availabilityDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  availabilityDayLabel: {
    width: 50,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  availabilityTimeBlocks: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  availabilityBlock: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  availabilityBlockEnabled: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  availabilityCheckmark: {
    marginRight: 2,
  },
  availabilityBlockText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#999',
  },
  availabilityBlockTextEnabled: {
    color: 'white',
  },
});
