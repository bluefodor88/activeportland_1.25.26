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
import { LinearGradient } from 'expo-linear-gradient';
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
  const [invites, setInvites] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
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

        if (user?.id) {
          const now = new Date();
          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() - 7);
          const cutoffDate = cutoff.toISOString().split('T')[0];
          setInvitesLoading(true);
          await supabase
            .from('meetup_invites')
            .delete()
            .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
            .lt('event_date', cutoffDate);

          const { data: inviteData, error: inviteError } = await supabase
            .from('meetup_invites')
            .select(`
              id,
              status,
              event_date,
              event_time,
              location,
              created_at,
              activity_name,
              sender_id,
              recipient_id,
              sender:profiles!meetup_invites_sender_id_fkey(id, name, avatar_url),
              recipient:profiles!meetup_invites_recipient_id_fkey(id, name, avatar_url)
            `)
            .or(
              `and(sender_id.eq.${user.id},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${user.id})`
            )
            .order('created_at', { ascending: false });

          if (inviteError) {
            console.error('Error fetching invites for profile:', inviteError);
            setInvites([]);
          } else {
            const filtered = (inviteData || []).filter((invite: any) => {
              if (!invite.event_date) return true;
              const eventTime = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
              return eventTime >= cutoff.getTime();
            });
            setInvites(filtered);
          }
          setInvitesLoading(false);
        }
      } catch (error) {
        console.error('Unexpected error fetching person details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user?.id]);

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

  const handleInviteResponse = async (inviteId: string, status: 'accepted' | 'declined') => {
    if (!inviteId?.trim()) return;
    try {
      const { error } = await supabase
        .from('meetup_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) {
        Alert.alert('Error', 'Failed to update invite.');
        return;
      }

      setInvites((prev) =>
        prev.map((invite) => (invite.id === inviteId ? { ...invite, status } : invite))
      );
    } catch (error) {
      console.error('Error responding to invite:', error);
      Alert.alert('Error', 'Failed to update invite.');
    }
  };

  const getInviteStatusStyle = (status: string) => {
    if (status === 'accepted') {
      return { badge: { backgroundColor: '#E7F6EA' }, text: { color: '#2E7D32' } };
    }
    if (status === 'declined') {
      return { badge: { backgroundColor: '#FFE8E8' }, text: { color: '#C0392B' } };
    }
    return { badge: { backgroundColor: '#FFF3D6' }, text: { color: '#B26A00' } };
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
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionDivider}
            />
            {availabilityLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 16 }} />
            ) : (
              <View style={styles.availabilityContainer}>
                {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                  const daySlots = availability.filter(
                    (slot) => slot.day_of_week === dayIndex && slot.enabled
                  );
                  if (daySlots.length === 0) return null;
                  const timeLabels = daySlots
                    .map((slot) => slot.time_block)
                    .filter(Boolean)
                    .sort((a, b) => TIME_BLOCKS.indexOf(a) - TIME_BLOCKS.indexOf(b))
                    .map((timeBlock) => timeBlock.toUpperCase());

                  return (
                    <View key={dayIndex} style={styles.availabilityLine}>
                      <Text style={styles.availabilityLineDay}>{dayName}:</Text>
                      <View style={styles.availabilityChips}>
                        {timeLabels.map((label) => (
                          <View key={`${dayIndex}-${label}`} style={styles.availabilityChip}>
                            <Text style={styles.availabilityChipText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
                {availability.filter((slot) => slot.enabled).length === 0 && (
                  <Text style={styles.emptyText}>No availability preferences set.</Text>
                )}
              </View>
            )}
          </View>

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Activities</Text>
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionDivider}
            />
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

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Invites</Text>
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionDivider}
            />
            {invitesLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 12 }} />
            ) : invites.length === 0 ? (
              <Text style={styles.emptyText}>No invites yet.</Text>
            ) : (
              (() => {
                const now = Date.now();
                const sorted = invites
                  .slice()
                  .sort((a, b) => {
                    const aDate = a.event_date ? new Date(`${a.event_date}T${a.event_time || '00:00'}`).getTime() : Infinity;
                    const bDate = b.event_date ? new Date(`${b.event_date}T${b.event_time || '00:00'}`).getTime() : Infinity;
                    return aDate - bDate;
                  });
                const upcoming = sorted.filter((invite) => {
                  if (!invite.event_date) return true;
                  const time = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
                  return time >= now;
                });
                const past = sorted.filter((invite) => {
                  if (!invite.event_date) return false;
                  const time = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
                  return time < now;
                });

                const renderInviteCard = (invite: any) => {
                  const isSender = invite.sender_id === user?.id;
                  const isRecipient = invite.recipient_id === user?.id;
                  const status = (invite.status || 'pending').toLowerCase();
                  const statusStyle = getInviteStatusStyle(status);
                const otherName = isSender ? invite.recipient?.name : invite.sender?.name;
                const title = otherName || 'Member';
                const dateLabel = invite.event_date
                  ? new Date(invite.event_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Date TBD';
                const timeLabel = invite.event_time
                  ? new Date(`2000-01-01T${invite.event_time}`).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : 'Time TBD';
                const activityLabel = invite.activity_name || 'Activity TBD';

                return (
                  <View key={invite.id} style={styles.inviteCard}>
                    <View style={styles.inviteHeaderRow}>
                      <Text style={styles.inviteTitle}>{title}</Text>
                      <View style={[styles.inviteStatusBadge, statusStyle.badge]}>
                        <Text style={[styles.inviteStatusText, statusStyle.text]}>
                          {status === 'pending' ? 'Pending' : status === 'accepted' ? 'Accepted' : 'Declined'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.inviteMeta}>🏷️ {activityLabel}</Text>
                    <Text style={styles.inviteMeta}>📅 {dateLabel} • {timeLabel}</Text>

                    {status === 'pending' && isRecipient && (
                      <View style={styles.inviteActionsRow}>
                        <TouchableOpacity
                          style={styles.inviteAcceptButton}
                          onPress={() => handleInviteResponse(invite.id, 'accepted')}
                        >
                          <Text style={styles.inviteAcceptText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inviteDeclineButton}
                          onPress={() => handleInviteResponse(invite.id, 'declined')}
                        >
                          <Text style={styles.inviteDeclineText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    </View>
                  );
                };

                return (
                  <View>
                    {upcoming.map(renderInviteCard)}
                    {past.length > 0 && (
                      <View style={styles.invitesPastSection}>
                        <Text style={styles.invitesPastTitle}>Past Events</Text>
                        <View style={styles.invitesPastPills}>
                        {past
                          .slice()
                          .reverse()
                          .map((invite: any) => {
                          const isSender = invite.sender_id === user?.id;
                          const otherName = isSender ? invite.recipient?.name : invite.sender?.name;
                          const activityLabel = invite.activity_name || 'Activity TBD';
                          const dateLabel = invite.event_date
                            ? new Date(invite.event_date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Date TBD';
                          return (
                            <View key={invite.id} style={styles.invitePastRow}>
                              <Text style={styles.invitePastText}>
                                {otherName || 'Member'} • {activityLabel} • {dateLabel}
                              </Text>
                            </View>
                          );
                        })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })()
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
  inviteCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginTop: 10,
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  inviteTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  inviteStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  inviteStatusText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  inviteMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  inviteAcceptButton: {
    flex: 1,
    backgroundColor: '#FF8C42',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteAcceptText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  inviteDeclineButton: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteDeclineText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#666',
  },
  invitesPastSection: {
    marginTop: 8,
  },
  invitesPastTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#8A8A8A',
    marginBottom: 6,
  },
  invitesPastPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  invitePastRow: {
    backgroundColor: '#FFF3E8',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FFE2CC',
  },
  invitePastText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#A35B2A',
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
  sectionDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
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
    marginTop: 6,
    gap: 6,
  },
  availabilityLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  availabilityLineDay: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#8A8A8A',
    textTransform: 'uppercase',
    width: 90,
  },
  availabilityChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  availabilityChip: {
    backgroundColor: '#FFF3E8',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#FFE2CC',
  },
  availabilityChipText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#A35B2A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
