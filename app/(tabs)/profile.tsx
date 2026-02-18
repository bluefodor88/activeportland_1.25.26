import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Switch,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useActivities } from '@/hooks/useActivities';
import { supabase } from '@/lib/supabase';
import { useCallback } from 'react';
import { ActivitySelectionModal } from '@/components/ActivitySelectionModal';
import { ICONS } from '@/lib/helperUtils';
import Constants from 'expo-constants';
import { sendLocalNotification } from '@/hooks/useNotifications';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { useAvailability } from '@/hooks/useAvailability';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, userSkills, loading, uploading, updateSkillLevel, updateReadyToday, uploadProfileImage, refetch } = useProfile();
  const { activities } = useActivities();
  const { availability, loading: availabilityLoading, updateAvailability, DAYS_OF_WEEK, TIME_BLOCKS } = useAvailability();
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showAvailabilityInfo, setShowAvailabilityInfo] = useState(false);
  const [showReadyTodayInfo, setShowReadyTodayInfo] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsScreen, setSettingsScreen] = useState<
    'main' | 'notifications' | 'privacy' | 'account' | 'about' | 'terms' | 'blocked' | 'test'
  >('main');
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'undetermined' | 'provisional' | 'unknown'>('unknown');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    body: string;
    confirmText: string;
    onConfirm: () => Promise<void> | void;
    destructive?: boolean;
  } | null>(null);
  const [showSystemSettingsPrompt, setShowSystemSettingsPrompt] = useState(false);
  const hasActivities = userSkills.some((userSkill) => userSkill.activities);

  // Fetch blocked users
  const fetchBlockedUsers = useCallback(async () => {
    if (!user?.id) {
      setBlockedUsers([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching blocked users:', error);
        setBlockedUsers([]);
        return;
      }

      if (!data || data.length === 0) {
        setBlockedUsers([]);
        return;
      }

      // Fetch profile info for each blocked user
      const blockedUserIds = data.map((item: any) => item.blocked_user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', blockedUserIds);

      if (profilesError) {
        console.error('Error fetching blocked user profiles:', profilesError);
        setBlockedUsers([]);
      } else {
        const mapped = (profiles || []).map((profile: any) => ({
          id: profile.id,
          name: profile.name || 'Unknown User',
          avatar_url: profile.avatar_url || null,
        }));
        setBlockedUsers(mapped);
      }
    } catch (error) {
      console.error('Unexpected error fetching blocked users:', error);
      setBlockedUsers([]);
    }
  }, [user?.id]);

  const fetchInvites = useCallback(async () => {
    if (!user?.id) {
      setInvites([]);
      return;
    }
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffDate = cutoff.toISOString().split('T')[0];
    setInvitesLoading(true);
    try {
      await supabase
        .from('meetup_invites')
        .delete()
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .lt('event_date', cutoffDate);

      const { data, error } = await supabase
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
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching invites:', error);
        setInvites([]);
      } else {
        const filtered = (data || []).filter((invite: any) => {
          if (!invite.event_date) return true;
          const eventTime = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
          return eventTime >= cutoff.getTime();
        });
        setInvites(filtered);
      }
    } catch (error) {
      console.error('Error fetching invites:', error);
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [user?.id]);

  const refreshNotificationStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationStatus(status ?? 'unknown');
  };

  const openSettingsScreen = async (
    screen: 'main' | 'notifications' | 'privacy' | 'account' | 'about' | 'terms' | 'blocked' | 'test'
  ) => {
    setSettingsError(null);
    setSettingsMessage(null);
    setSettingsScreen(screen);
    setSettingsModalVisible(true);
    if (screen === 'notifications' || screen === 'main') {
      await refreshNotificationStatus();
    }
    if (screen === 'blocked') {
      await fetchBlockedUsers();
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && settingsModalVisible) {
        refreshNotificationStatus();
      }
    });
    return () => subscription.remove();
  }, [settingsModalVisible]);

  const openConfirm = (config: {
    title: string;
    body: string;
    confirmText: string;
    onConfirm: () => Promise<void> | void;
    destructive?: boolean;
  }) => {
    setConfirmConfig(config);
  };

  // Refresh profile data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      fetchBlockedUsers();
      fetchInvites();
    }, [refetch, fetchBlockedUsers, fetchInvites])
  );

  // Get list of activity IDs user has already selected
  const selectedActivityIds = userSkills
    .map((skill) => skill.activity_id)
    .filter(Boolean);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sorry, we need camera roll permissions to change your profile photo.');
      return false;
    }
    return true;
  };

  const handleImageSelection = async (type: 'library' | 'camera') => {
    if (type === 'library') {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;
    } else {
       const { status } = await ImagePicker.requestCameraPermissionsAsync();
       if (status !== 'granted') {
          Alert.alert('Permission Required', 'We need camera access.');
          return;
       }
    }

    try {
      let result;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      };
      
      if (type === 'library') {
        result = await ImagePicker.launchImageLibraryAsync(options);
      } else {
        result = await ImagePicker.launchCameraAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;

        // Ask the user to confirm before saving the new photo
        Alert.alert(
          'Save Profile Photo',
          'Use this photo as your profile picture?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: async () => {
                const response = await uploadProfileImage(uri);

                if (response.success) {
                  Alert.alert('Success', 'Profile photo updated!');
                } else {
                  Alert.alert('Error', response.error || 'Failed to upload image');
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image.');
    }
  };

  const handleImageUpload = () => {
    Alert.alert(
      'Change Profile Photo',
      'Choose an option',
      [
        { text: 'Camera', onPress: () => handleImageSelection('camera') },
        { text: 'Photo Library', onPress: () => handleImageSelection('library') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };


  const handleSkillLevelChange = (activity: string) => {
    const activityObj = activities.find(a => a.name === activity);
    if (!activityObj) return;

    Alert.alert(
      `${activity} Skill Level`,
      'Select your skill level',
      [
        { text: 'Beginner', onPress: () => updateSkillLevel(activityObj.id, 'Beginner') },
        { text: 'Intermediate', onPress: () => updateSkillLevel(activityObj.id, 'Intermediate') },
        { text: 'Advanced', onPress: () => updateSkillLevel(activityObj.id, 'Advanced') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleRemoveActivity = async (activityId: string, activityName: string) => {
    Alert.alert(
      `Remove ${activityName}`,
      'Are you sure you want to remove this activity from your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            
            try {
              const { error } = await supabase
                .from('user_activity_skills')
                .delete()
                .eq('user_id', user.id)
                .eq('activity_id', activityId);
              
              if (error) {
                console.error('Error removing activity:', error);
                Alert.alert('Error', 'Failed to remove activity');
              } else {
                refetch();
              }
            } catch (error) {
              console.error('Error removing activity:', error);
              Alert.alert('Error', 'Failed to remove activity');
            }
          }
        },
      ]
    );
  };

  const handleInviteResponse = async (inviteId: string, status: 'accepted' | 'declined') => {
    if (!inviteId?.trim()) return;
    try {
      const { error } = await supabase
        .from('meetup_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) {
        setSettingsError('Failed to update invite.');
        return;
      }

      setSettingsMessage(status === 'accepted' ? 'Invite accepted.' : 'Invite declined.');
      fetchInvites();
    } catch (error) {
      console.error('Error responding to invite:', error);
      setSettingsError('Failed to update invite.');
    }
  };

  const getSkillColor = (skillLevel: string) => {
    switch (skillLevel) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FFBF00';
      case 'Advanced':
        return '#FF9800';
      default:
        return '#999';
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

  const handleLogout = () => {
    openConfirm({
      title: 'Log out?',
      body: 'You can sign back in any time.',
      confirmText: 'Log out',
      destructive: true,
      onConfirm: async () => {
        const { error } = await signOut();
        if (error) {
          setSettingsError('Failed to log out. Please try again.');
          return;
        }
        router.replace('/(auth)/login');
      },
    });
  };

  const handleAppSettings = () => {
    openSettingsScreen('main');
  };

  const handleNotificationSettings = async () => {
    openSettingsScreen('notifications');
  };

  const handleBlockedUsers = async () => {
    openSettingsScreen('blocked');
  };

  const handlePrivacySettings = () => {
    openSettingsScreen('privacy');
  };

  const handleAccountSettings = () => {
    openSettingsScreen('account');
  };

  const handleTermsAndSafety = () => {
    openSettingsScreen('terms');
  };

  const handleAboutApp = () => {
    openSettingsScreen('about');
  };

  const notificationsEnabled = notificationStatus === 'granted';
  const forumNotificationsEnabled = profile?.forum_notifications_enabled !== false;
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.manifest?.ios?.buildNumber || 'Unknown';
  const version = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';

  // Require login for profile (account-based feature)
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <Ionicons name="person" size={64} color="#ccc" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Sign in to view your profile</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to manage your activities and settings
          </Text>
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.imageContainer} onPress={handleImageUpload} disabled={uploading}>
            {uploading ? (
              <View style={[styles.profileImage, styles.uploadingOverlay]}>
                 <ActivityIndicator color="#FF8C42" />
              </View>
            ) : (
              <Image 
                source={ profile?.avatar_url ? { uri: profile?.avatar_url } : ICONS.profileIcon } 
                style={styles.profileImage} 
              />
            )}
            <View style={styles.cameraIconContainer}>
                <Ionicons name="camera" size={16} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.name || 'Loading...'}</Text>
          <Text style={styles.email}>{profile?.email || 'Loading...'}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleInline} numberOfLines={1}>
              My Activities
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowActivityModal(true)}
            >
              <Ionicons name="add" size={18} color="white" />
              <Text style={styles.addButtonText} numberOfLines={1}>
                Add Activity
              </Text>
            </TouchableOpacity>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.activitiesDivider, !hasActivities && styles.activitiesDividerTight]}
          />
          {userSkills
            .filter((userSkill) => userSkill.activities) // Filter out any without activities
            .sort((a, b) => {
              // Sort alphabetically by activity name
              const nameA = a.activities?.name || '';
              const nameB = b.activities?.name || '';
              return nameA.localeCompare(nameB);
            })
            .map((userSkill) => {
            return (
              <View key={userSkill.id} style={styles.skillItemContainer}>
                <TouchableOpacity
                  style={styles.removeIconButton}
                  onPress={() => handleRemoveActivity(userSkill.activity_id, userSkill.activities!.name)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={14} color="#9AA0A6" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skillItem}
                  onPress={() => handleSkillLevelChange(userSkill.activities!.name)}
                >
                  <View style={styles.skillInfo}>
                    <Text style={styles.activityEmoji}>{userSkill.activities?.emoji}</Text>
                    <Text style={styles.activityName}>{userSkill.activities?.name}</Text>
                    <View style={[styles.skillBadge, { backgroundColor: getSkillColor(userSkill.skill_level) }]}>
                      <Text style={styles.skillText}>{userSkill.skill_level}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={styles.skillItemActions}>
                  <View style={styles.readyTodayContainer}>
                    <View style={styles.readyTodayLabelGroup}>
                      <Text style={styles.readyTodayLabel}>READY TODAY?</Text>
                      <TouchableOpacity
                        style={styles.readyTodayInfo}
                        onPress={() => setShowReadyTodayInfo(true)}
                      >
                        <Ionicons name="information-circle-outline" size={14} color="#666" />
                      </TouchableOpacity>
                    </View>
                    <ReadyTodayToggle
                      value={!!userSkill.ready_today}
                      onToggle={() => {
                        updateReadyToday(userSkill.activity_id, !userSkill.ready_today).catch(console.error);
                      }}
                    />
                  </View>
                </View>
              </View>
            );
          })}
          {userSkills.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.noActivitiesText}>
                Ready to dive in? Tap “Add Activity” to personalize your profile and meet others.
              </Text>
            </View>
          )}
        </View>

        <ActivitySelectionModal
          visible={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          onComplete={() => {
            refetch();
            setShowActivityModal(false);
          }}
          excludeActivityIds={selectedActivityIds}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRowLeft}>
            <View style={styles.sectionTitleInlineRow}>
              <Text style={styles.sectionTitleInlineCompact}>My Availability</Text>
              <TouchableOpacity
                style={styles.sectionInfoButton}
                onPress={() => setShowAvailabilityInfo(true)}
              >
                <Ionicons name="information-circle-outline" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.activitiesDivider}
          />
          {availabilityLoading ? (
            <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.availabilityContainer}>
              <View style={styles.availabilityHeaderRow}>
                <Text style={styles.availabilityHeaderSpacer} />
                <View style={styles.availabilityTimeBlocks}>
                  {TIME_BLOCKS.map((timeBlock) => {
                    const timeBlockLabel = timeBlock.charAt(0).toUpperCase() + timeBlock.slice(1);
                    return (
                      <View key={timeBlock} style={styles.availabilityHeaderCell}>
                        <Text style={styles.availabilityHeaderText}>{timeBlockLabel}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                const daySlots = availability.filter(
                  (slot) => slot.day_of_week === dayIndex
                );
                return (
                  <View key={dayIndex} style={styles.availabilityDayRow}>
                    <Text style={styles.availabilityDayLabel}>
                      {dayName}
                    </Text>
                    <View style={styles.availabilityTimeBlocks}>
                      {TIME_BLOCKS.map((timeBlock) => {
                        const slot = daySlots.find(
                          (s) => s.time_block === timeBlock
                        );
                        const isEnabled = slot?.enabled || false;
                        return (
                          <View key={timeBlock} style={styles.availabilityCell}>
                            <TouchableOpacity
                              style={[
                                styles.availabilityBlock,
                                isEnabled && styles.availabilityBlockEnabled,
                              ]}
                              onPress={() => {
                                updateAvailability(
                                  dayIndex as any,
                                  timeBlock,
                                  !isEnabled
                                ).catch(console.error);
                              }}
                            >
                              <Ionicons
                                name={isEnabled ? 'checkmark' : 'close'}
                                size={12}
                                color={isEnabled ? 'white' : '#B0B0B0'}
                                style={styles.availabilityCheckmark}
                              />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleInline}>Invites</Text>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.activitiesDivider}
          />
          {invitesLoading ? (
            <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 12 }} />
          ) : invites.length === 0 ? (
            <Text style={styles.invitesEmptyText}>No invites yet.</Text>
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
                  <Text style={styles.inviteMeta}>{activityLabel} • {dateLabel} • {timeLabel}</Text>

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

        <Modal
          visible={showAvailabilityInfo}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAvailabilityInfo(false)}
        >
          <BlurView intensity={20} style={styles.infoOverlay}>
            <View style={styles.infoCard}>
              <View style={styles.infoCloseRow}>
                <TouchableOpacity
                  onPress={() => setShowAvailabilityInfo(false)}
                  style={styles.infoClose}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.infoBody}>
                <Text style={styles.infoBodyBold}>Choose</Text>
                {' '}the times you’re usually free so others know when you’re open to play or meet up.{'\n'}{'\n'}
                <Text style={styles.infoBodyBold}>Tap</Text>
                {' '}a box to mark yourself available.
              </Text>
              <TouchableOpacity
                style={styles.infoPrimaryButton}
                onPress={() => setShowAvailabilityInfo(false)}
              >
                <Text style={styles.infoPrimaryText}>I’m Ready</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>

        <Modal
          visible={showReadyTodayInfo}
          transparent
          animationType="fade"
          onRequestClose={() => setShowReadyTodayInfo(false)}
        >
          <BlurView intensity={20} style={styles.infoOverlay}>
            <View style={styles.infoCard}>
              <View style={styles.infoCloseRow}>
                <TouchableOpacity
                  onPress={() => setShowReadyTodayInfo(false)}
                  style={styles.infoClose}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.infoBody}>
                Turn this on if you’re available to join this activity today. It helps others know you’re up for plans now.
              </Text>
              <TouchableOpacity
                style={styles.infoPrimaryButton}
                onPress={() => setShowReadyTodayInfo(false)}
              >
                <Text style={styles.infoPrimaryText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleInline}>Settings</Text>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.activitiesDivider}
          />
          <TouchableOpacity style={styles.settingRow} onPress={handleNotificationSettings}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="notifications-outline" size={18} color="#FF8C42" />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>Notifications</Text>
              <Text style={styles.settingSubtitle}>Forum, Chat, Meet-up Reminders</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={handlePrivacySettings}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#FF8C42" />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>Privacy & Safety</Text>
              <Text style={styles.settingSubtitle}>Visibility, Blocked Users, Reports</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={handleAccountSettings}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="person-circle-outline" size={18} color="#FF8C42" />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>Account</Text>
              <Text style={styles.settingSubtitle}>Password, Email, Delete</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={handleAboutApp}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="information-circle-outline" size={18} color="#FF8C42" />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>About</Text>
              <Text style={styles.settingSubtitle}>Version, Support, Terms</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={handleTermsAndSafety}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="document-text-outline" size={18} color="#FF8C42" />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>Terms & Safety</Text>
              <Text style={styles.settingSubtitle}>Guidelines & Policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#D84A4A" />
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={settingsModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <BlurView intensity={20} style={styles.settingsOverlay}>
            <View style={styles.settingsCard}>
              <View style={styles.settingsHeader}>
                {settingsScreen !== 'main' ? (
                  <TouchableOpacity
                    style={styles.settingsBack}
                    onPress={() => setSettingsModalVisible(false)}
                  >
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.settingsBackPlaceholder} />
                )}
                <Text style={styles.settingsTitle}>
                  {settingsScreen === 'main' && 'Settings'}
                  {settingsScreen === 'notifications' && 'Notifications'}
                  {settingsScreen === 'privacy' && 'Privacy & Safety'}
                  {settingsScreen === 'account' && 'Account'}
                  {settingsScreen === 'about' && 'About'}
                  {settingsScreen === 'terms' && 'Terms & Safety'}
                  {settingsScreen === 'blocked' && 'Blocked Users'}
                  {settingsScreen === 'test' && 'Test Notifications'}
                </Text>
                <TouchableOpacity
                  style={styles.settingsClose}
                  onPress={() => setSettingsModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {settingsError && (
                <View style={styles.settingsBannerError}>
                  <Text style={styles.settingsBannerText}>{settingsError}</Text>
                </View>
              )}
              {settingsMessage && (
                <View style={styles.settingsBannerSuccess}>
                  <Text style={styles.settingsBannerText}>{settingsMessage}</Text>
                </View>
              )}

              <ScrollView style={styles.settingsContent} showsVerticalScrollIndicator={false}>
                {settingsScreen === 'main' && (
                  <View>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('notifications')}>
                      <Text style={styles.settingsNavTitle}>Notifications</Text>
                      <Text style={styles.settingsNavSubtitle}>Forum, chat, meetup reminders</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('privacy')}>
                      <Text style={styles.settingsNavTitle}>Privacy & Safety</Text>
                      <Text style={styles.settingsNavSubtitle}>Visibility, blocked users, reporting</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('account')}>
                      <Text style={styles.settingsNavTitle}>Account</Text>
                      <Text style={styles.settingsNavSubtitle}>Password, email, sign out</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('about')}>
                      <Text style={styles.settingsNavTitle}>About</Text>
                      <Text style={styles.settingsNavSubtitle}>Version, terms, support</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('terms')}>
                      <Text style={styles.settingsNavTitle}>Terms & Safety</Text>
                      <Text style={styles.settingsNavSubtitle}>Guidelines and policies</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {settingsScreen === 'notifications' && (
                  <View>
                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>System Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Enable notifications at the OS level</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled}
                          onValueChange={() => setShowSystemSettingsPrompt(true)}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>Forum Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Mute all forum alerts</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={forumNotificationsEnabled}
                          onValueChange={async (nextValue) => {
                            if (!user) {
                              setSettingsError('Sign in required to update notifications.');
                              return;
                            }
                            setSettingsError(null);
                            const { error } = await supabase
                              .from('profiles')
                              .update({ forum_notifications_enabled: nextValue })
                              .eq('id', user.id);
                            if (error) {
                              setSettingsError('Failed to update forum notifications.');
                              return;
                            }
                            refetch();
                            setSettingsMessage(`Forum notifications ${nextValue ? 'enabled' : 'disabled'}.`);
                          }}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={forumNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('test')}>
                      <Text style={styles.settingsNavTitle}>Test Notifications</Text>
                      <Text style={styles.settingsNavSubtitle}>Preview how alerts appear</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {settingsScreen === 'test' && (
                  <View style={styles.settingsButtonGroup}>
                    <TouchableOpacity
                      style={[styles.settingsPrimaryButton, styles.settingsPrimaryButtonStack]}
                      onPress={async () => {
                        try {
                          await sendLocalNotification(
                            'Test User',
                            'This is a test message notification!',
                            { type: 'new_message', chatId: 'test', otherUserId: 'test', userName: 'Test User' }
                          );
                          setSettingsMessage('Message notification sent.');
                        } catch (error) {
                          setSettingsError('Failed to send notification.');
                        }
                      }}
                    >
                      <Text style={styles.settingsPrimaryText}>Test Message Notification</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.settingsPrimaryButton, styles.settingsPrimaryButtonStack]}
                      onPress={async () => {
                        try {
                          await sendLocalNotification(
                            'Forum: Pickleball',
                            'Test User\nThis is a test forum message!',
                            { type: 'forum_message', activityId: 'test', senderId: 'test', activityName: 'Pickleball' }
                          );
                          setSettingsMessage('Forum notification sent.');
                        } catch (error) {
                          setSettingsError('Failed to send notification.');
                        }
                      }}
                    >
                      <Text style={styles.settingsPrimaryText}>Test Forum Notification</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.settingsPrimaryButton, styles.settingsPrimaryButtonStack]}
                      onPress={async () => {
                        try {
                          await sendLocalNotification(
                            '⏰ Event Reminder',
                            'Your meetup with Test User at Test Location starts in 5 minutes!',
                            { type: 'event_reminder', meetingId: 'test' }
                          );
                          setSettingsMessage('Event reminder sent.');
                        } catch (error) {
                          setSettingsError('Failed to send notification.');
                        }
                      }}
                    >
                      <Text style={styles.settingsPrimaryText}>Test Event Reminder</Text>
                    </TouchableOpacity>
                  </View>
                )}


                {settingsScreen === 'privacy' && (
                  <View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Profile Visibility</Text>
                      <Text style={styles.settingsInfoBody}>
                        Visible to activity members only.
                      </Text>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Location Sharing</Text>
                      <Text style={styles.settingsInfoBody}>
                        Approximate location is shared for meetups.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={handleBlockedUsers}>
                      <Text style={styles.settingsNavTitle}>Blocked Users</Text>
                      <Text style={styles.settingsNavSubtitle}>
                        {blockedUsers.length > 0 ? `${blockedUsers.length} blocked` : 'None blocked'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Report Issues</Text>
                      <Text style={styles.settingsInfoBody}>
                        Contact: activityhubsercive@gmail.com
                      </Text>
                      <TouchableOpacity
                        style={styles.settingsPrimaryButton}
                        onPress={() => Linking.openURL('mailto:activityhubsercive@gmail.com')}
                      >
                        <Text style={styles.settingsPrimaryText}>Email Support</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {settingsScreen === 'blocked' && (
                  <View>
                    {blockedUsers.length === 0 ? (
                      <Text style={styles.settingsEmptyText}>You have no blocked users.</Text>
                    ) : (
                      blockedUsers.map((blockedUser: any) => (
                        <View key={blockedUser.id} style={styles.blockedRow}>
                          <Image
                            source={blockedUser.avatar_url ? { uri: blockedUser.avatar_url } : ICONS.profileIcon}
                            style={styles.blockedAvatar}
                          />
                          <Text style={styles.blockedName}>{blockedUser.name}</Text>
                          <TouchableOpacity
                            style={styles.blockedButton}
                            onPress={() =>
                              openConfirm({
                                title: 'Unblock user?',
                                body: `Unblock ${blockedUser.name}?`,
                                confirmText: 'Unblock',
                                onConfirm: async () => {
                                  if (!user?.id) return;
                                  const { error } = await supabase
                                    .from('blocked_users')
                                    .delete()
                                    .eq('user_id', user.id)
                                    .eq('blocked_user_id', blockedUser.id);
                                  if (error) {
                                    setSettingsError('Failed to unblock user.');
                                    return;
                                  }
                                  await fetchBlockedUsers();
                                  setSettingsMessage(`${blockedUser.name} unblocked.`);
                                },
                              })
                            }
                          >
                            <Text style={styles.blockedButtonText}>Unblock</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {settingsScreen === 'account' && (
                  <View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Change Password</Text>
                      <Text style={styles.settingsInfoBody}>
                        We’ll email a reset link to your account email.
                      </Text>
                      <TouchableOpacity
                        style={styles.settingsPrimaryButton}
                        onPress={async () => {
                          if (!profile?.email) {
                            setSettingsError('No email on file.');
                            return;
                          }
                          const { error } = await supabase.auth.resetPasswordForEmail(profile.email);
                          if (error) {
                            setSettingsError('Failed to send reset link.');
                            return;
                          }
                          setSettingsMessage('Reset link sent. Check your email.');
                        }}
                      >
                        <Text style={styles.settingsPrimaryText}>Send Reset Link</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Update Email</Text>
                      <Text style={styles.settingsInfoBody}>
                        Email updates require verification. Contact support.
                      </Text>
                      <TouchableOpacity
                        style={styles.settingsPrimaryButton}
                        onPress={() => Linking.openURL('mailto:activityhubsercive@gmail.com')}
                      >
                        <Text style={styles.settingsPrimaryText}>Email Support</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Delete Account</Text>
                      <Text style={styles.settingsInfoBody}>
                        This will permanently delete your account and data.
                      </Text>
                      <TouchableOpacity
                        style={[styles.settingsPrimaryButton, styles.settingsDangerButton]}
                        onPress={() =>
                          openConfirm({
                            title: 'Delete account?',
                            body: 'This action cannot be undone. Email support to proceed.',
                            confirmText: 'Email Support',
                            destructive: true,
                            onConfirm: () => Linking.openURL('mailto:activityhubsercive@gmail.com'),
                          })
                        }
                      >
                        <Text style={styles.settingsPrimaryText}>Contact Support</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {settingsScreen === 'about' && (
                  <View style={styles.settingsInfoCard}>
                    <Text style={styles.settingsInfoTitle}>The Activity Hub</Text>
                    <Text style={styles.settingsInfoBody}>
                      Connect with people who share your interests and activity levels.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Version: {version} • Build: {buildNumber}
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Support: activityhubsercive@gmail.com
                    </Text>
                    <TouchableOpacity
                      style={styles.settingsPrimaryButton}
                      onPress={() => openSettingsScreen('terms')}
                    >
                      <Text style={styles.settingsPrimaryText}>View Terms & Safety</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {settingsScreen === 'terms' && (
                  <View style={styles.settingsInfoCard}>
                    <Text style={styles.settingsInfoTitle}>Terms & Safety</Text>
                    <Text style={styles.settingsInfoBody}>
                      By using The Activity Hub, you agree to our community guidelines and terms.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Zero tolerance for abusive or inappropriate behavior. Violations may result in account suspension.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Meet in public places for first-time meetups and prioritize your safety.
                    </Text>
                    <TouchableOpacity
                      style={styles.settingsPrimaryButton}
                      onPress={() => Linking.openURL('https://bluefodor88.github.io')}
                    >
                      <Text style={styles.settingsPrimaryText}>Open Full Policy</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
              {showSystemSettingsPrompt && (
                <View style={styles.inlinePromptOverlay}>
                  <View style={styles.inlinePromptCard}>
                    <Text style={styles.inlinePromptTitle}>Manage Notifications</Text>
                    <Text style={styles.inlinePromptBody}>
                      On iOS, notification permissions are managed in Settings. Tap “Go” to open The Activity Hub settings and turn notifications on or off.
                    </Text>
                    <View style={styles.inlinePromptActions}>
                      <TouchableOpacity
                        style={styles.inlinePromptCancel}
                        onPress={() => setShowSystemSettingsPrompt(false)}
                      >
                        <Text style={styles.inlinePromptCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inlinePromptGo}
                        onPress={async () => {
                          setShowSystemSettingsPrompt(false);
                          try {
                            await Linking.openSettings();
                          } catch {
                            if (Platform.OS === 'ios') {
                              Linking.openURL('app-settings:');
                            }
                          }
                        }}
                      >
                        <Text style={styles.inlinePromptGoText}>Go</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </BlurView>
        </Modal>

        <Modal
          visible={!!confirmConfig}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmConfig(null)}
        >
          <BlurView intensity={20} style={styles.settingsOverlay}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>{confirmConfig?.title}</Text>
              <Text style={styles.confirmBody}>{confirmConfig?.body}</Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.confirmCancel}
                  onPress={() => setConfirmConfig(null)}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.confirmConfirm,
                    confirmConfig?.destructive && styles.confirmConfirmDanger,
                  ]}
                  onPress={async () => {
                    const action = confirmConfig;
                    setConfirmConfig(null);
                    if (action) {
                      await action.onConfirm();
                    }
                  }}
                >
                  <Text style={styles.confirmConfirmText}>{confirmConfig?.confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReadyTodayToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const translate = useRef(new Animated.Value(value ? 22 : 2)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: value ? 22 : 2,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [value, translate]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggle}
      style={[styles.readyToggle, value ? styles.readyToggleOn : styles.readyToggleOff]}
    >
      <Animated.View
        style={[
          styles.readyToggleThumb,
          { transform: [{ translateX: translate }] },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  uploadingOverlay: {
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFCF56',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  name: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
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
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderTopWidth: 4,
    borderTopColor: '#FFCF56',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    transform: [{ scale: 1 }],
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 16,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 0,
    flex: 1,
    flexShrink: 1,
  },
  sectionTitleInlineCompact: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  sectionHeaderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitleInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  sectionInfoButton: {
    padding: 0,
  },
  infoOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  infoCloseRow: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  infoClose: {
    padding: 4,
  },
  infoBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    lineHeight: 20,
    marginHorizontal: 5,
    marginBottom: 16,
  },
  infoPrimaryButton: {
    alignSelf: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  infoPrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  activitiesDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
  },
  activitiesDividerTight: {
    marginBottom: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  emptyStateContainer: {
    alignItems: 'flex-start',
    paddingTop: 2,
    paddingBottom: 0,
  },
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  addFirstButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  skillItemContainer: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 12,
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    position: 'relative',
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  skillItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  readyTodayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
    marginRight: 12,
  },
  readyTodayLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  readyTodayLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  readyTodayInfo: {
    padding: 2,
  },
  readyToggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  readyToggleOn: {
    backgroundColor: '#4CD964',
  },
  readyToggleOff: {
    backgroundColor: '#E5E5EA',
  },
  readyToggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  skillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginRight: 12,
    flex: 1,
  },
  activityEmoji: {
    fontSize: 32,
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  removeIconButton: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginLeft: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EEE9',
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: {
    backgroundColor: '#FFE9E9',
  },
  settingTextBlock: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingTitleDanger: {
    color: '#D84A4A',
  },
  settingSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#7A7A7A',
    marginTop: 2,
  },
  invitesEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    textAlign: 'center',
    marginTop: 10,
  },
  inviteCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 10,
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
  settingsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  settingsCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  settingsTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsBack: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBackPlaceholder: {
    width: 32,
    height: 32,
  },
  settingsClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsContent: {
    marginTop: 6,
  },
  settingsBannerError: {
    backgroundColor: '#FFE8E8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  settingsBannerSuccess: {
    backgroundColor: '#E7F6EA',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  settingsBannerText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    textAlign: 'center',
  },
  settingsNavRow: {
    backgroundColor: '#FFF7EE',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  settingsNavTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsNavSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 4,
  },
  settingsInfoCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 12,
  },
  settingsInfoTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  settingsInfoBody: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  settingsPrimaryButton: {
    backgroundColor: '#FF8C42',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  settingsDangerButton: {
    backgroundColor: '#E45858',
  },
  settingsPrimaryText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  settingsToggleRow: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingsToggleText: {
    flex: 1,
    marginRight: 10,
  },
  settingsToggleSwitch: {
    paddingRight: 6,
  },
  settingsToggleTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsToggleSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 4,
  },
  settingsButtonGroup: {},
  settingsPrimaryButtonStack: {
    marginBottom: 10,
  },
  logoutButton: {
    marginTop: 12,
    backgroundColor: '#FFF1F1',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F6CACA',
  },
  logoutButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D84A4A',
  },
  settingsEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    textAlign: 'center',
    marginTop: 12,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  blockedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },
  blockedName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  blockedButton: {
    backgroundColor: '#FFE8E0',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  blockedButtonText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#C4462E',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  confirmTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  confirmBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  confirmCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  confirmConfirm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FF8C42',
  },
  confirmConfirmDanger: {
    backgroundColor: '#D84A4A',
  },
  confirmConfirmText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  inlinePromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  inlinePromptCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  inlinePromptTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  inlinePromptBody: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  inlinePromptActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  inlinePromptCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  inlinePromptCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  inlinePromptGo: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#FF8C42',
  },
  inlinePromptGoText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  noActivitiesText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingTop: 2,
    paddingBottom: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  infoBodyBold: {
    fontFamily: 'Inter_700Bold',
    color: '#555',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
  availabilityContainer: {
    marginTop: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 12,
    padding: 12,
  },
  availabilityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  availabilityHeaderSpacer: {
    width: 52,
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    color: '#9CA3AF',
  },
  availabilityHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  availabilityHeaderText: {
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  availabilityDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  availabilityDayLabel: {
    width: 52,
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  availabilityTimeBlocks: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  availabilityCell: {
    flex: 1,
    alignItems: 'center',
  },
  availabilityBlock: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E3E3',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    alignSelf: 'center',
  },
  availabilityBlockEnabled: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  availabilityCheckmark: {
    marginRight: 0,
  },
  availabilityBlockTextEnabled: {
    color: 'white',
  },
});
