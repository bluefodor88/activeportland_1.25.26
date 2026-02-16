import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
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
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
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

  // Refresh profile data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      fetchBlockedUsers();
    }, [refetch, fetchBlockedUsers])
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

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            const { error } = await signOut();
            if (error) {
              Alert.alert('Error', 'Failed to logout. Please try again.');
            } else {
              router.replace('/(auth)/login');
            }
          }
        },
      ]
    );
  };

  const handleAppSettings = () => {
    Alert.alert(
      'App Settings',
      'Choose a setting to configure',
      [
        { 
          text: 'Notifications', 
          onPress: () => handleNotificationSettings() 
        },
        { 
          text: 'Privacy & Safety', 
          onPress: () => handlePrivacySettings() 
        },
        { 
          text: 'Account Settings', 
          onPress: () => handleAccountSettings() 
        },
        { 
          text: 'About ActivityHub', 
          onPress: () => handleAboutApp() 
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleNotificationSettings = async () => {
    // Refresh blocked users list when opening settings
    await fetchBlockedUsers();
    
    // Check current notification permission status
    const { status } = await Notifications.getPermissionsAsync();
    const isEnabled = status === 'granted';
    const statusText = isEnabled ? 'Enabled' : 'Disabled';
    
    Alert.alert(
      'Notification Settings',
      `Configure your notification preferences\n\nCurrent Status: ${statusText}`,
      [
        { 
          text: 'Meeting Reminders', 
          onPress: () => {
            Alert.alert(
              'Meeting Reminders', 
              'Get notified 1 hour before scheduled meetups.\n\nStatus: ' + statusText,
              [
                { text: 'OK' },
                ...(isEnabled ? [] : [{
                  text: 'Enable in Settings',
                  onPress: () => {
                    if (Platform.OS === 'ios') {
                      Linking.openURL('app-settings:');
                    } else {
                      Linking.openSettings();
                    }
                  }
                }])
              ]
            );
          }
        },
        { 
          text: 'New Messages', 
          onPress: () => {
            Alert.alert(
              'New Messages', 
              'Get notified when you receive new chat messages.\n\nStatus: ' + statusText,
              [
                { text: 'OK' },
                ...(isEnabled ? [] : [{
                  text: 'Enable in Settings',
                  onPress: () => {
                    if (Platform.OS === 'ios') {
                      Linking.openURL('app-settings:');
                    } else {
                      Linking.openSettings();
                    }
                  }
                }])
              ]
            );
          }
        },
        {
          text: isEnabled ? 'Disable Notifications' : 'Enable Notifications',
          onPress: async () => {
            if (isEnabled) {
              // Open phone settings to disable
              Alert.alert(
                'Disable Notifications',
                'To disable notifications, please turn them off in your phone settings.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Open Settings',
                    onPress: () => {
                      if (Platform.OS === 'ios') {
                        Linking.openURL('app-settings:');
                      } else {
                        Linking.openSettings();
                      }
                    }
                  }
                ]
              );
            } else {
              // Request permissions
              const { status: newStatus } = await Notifications.requestPermissionsAsync();
              if (newStatus === 'granted') {
                Alert.alert('✅ Enabled', 'Notifications have been enabled!');
              } else {
                Alert.alert(
                  'Permission Denied',
                  'To enable notifications, please allow them in your phone settings.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open Settings',
                      onPress: () => {
                        if (Platform.OS === 'ios') {
                          Linking.openURL('app-settings:');
                        } else {
                          Linking.openSettings();
                        }
                      }
                    }
                  ]
                );
              }
            }
          }
        },
        { 
          text: '🔍 Debug Push Token', 
          onPress: async () => {
            try {
              const { status } = await Notifications.getPermissionsAsync();
              const permissionStatus = status === 'granted' ? '✅ Granted' : `❌ ${status}`;
              
              // Try to get push token
              let tokenInfo = 'Not generated';
              try {
                const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                                 (Constants as any).manifest?.extra?.eas?.projectId ||
                                 '08f6f8e6-0c4c-497a-988f-6b6b895984fe';
                
                if (status === 'granted') {
                  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                  tokenInfo = tokenData.data.substring(0, 40) + '...';
                  
                  // Check if stored in database
                  if (user) {
                    const { data: storedTokens } = await supabase
                      .from('push_tokens')
                      .select('expo_push_token')
                      .eq('user_id', user.id);
                    
                    const storedInfo = storedTokens && storedTokens.length > 0 
                      ? `✅ Stored (${storedTokens.length} token(s))` 
                      : '❌ Not stored in database';
                    
                    Alert.alert(
                      'Push Token Debug Info',
                      `Permission: ${permissionStatus}\n\nToken: ${tokenInfo}\n\nDatabase: ${storedInfo}\n\nProject ID: ${projectId.substring(0, 20)}...`,
                      [{ text: 'OK' }]
                    );
                  } else {
                    Alert.alert(
                      'Push Token Debug Info',
                      `Permission: ${permissionStatus}\n\nToken: ${tokenInfo}\n\nUser: Not logged in`,
                      [{ text: 'OK' }]
                    );
                  }
                } else {
                  Alert.alert(
                    'Push Token Debug Info',
                    `Permission: ${permissionStatus}\n\nToken: Cannot generate (permission denied)\n\nPlease enable notifications in Settings.`,
                    [{ text: 'OK' }]
                  );
                }
              } catch (error: any) {
                Alert.alert(
                  'Push Token Debug Info',
                  `Permission: ${permissionStatus}\n\nToken Error: ${error?.message || 'Unknown error'}\n\nCheck console for details.`,
                  [{ text: 'OK' }]
                );
              }
            } catch (error: any) {
              Alert.alert('Error', `Failed to get debug info: ${error?.message}`);
            }
          }
        },
        { 
          text: '🧪 Test Notifications', 
          onPress: () => {
            Alert.alert(
              'Test Notifications',
              'Choose a notification type to test',
              [
                {
                  text: 'Test Message Notification',
                  onPress: async () => {
                    try {
                      await sendLocalNotification(
                        'New message from Test User',
                        'This is a test message notification!',
                        { type: 'new_message', chatId: 'test', otherUserId: 'test', userName: 'Test User' }
                      );
                      Alert.alert('✅ Sent', 'Message notification sent!');
                    } catch (error) {
                      console.error('Error:', error);
                      Alert.alert('❌ Error', 'Failed to send notification.');
                    }
                  }
                },
                {
                  text: 'Test Event Reminder',
                  onPress: async () => {
                    try {
                      await sendLocalNotification(
                        '⏰ Event Reminder',
                        'Your meetup with Test User at Test Location starts in 60 minutes!',
                        { type: 'event_reminder', meetingId: 'test' }
                      );
                      Alert.alert('✅ Sent', 'Event reminder sent!');
                    } catch (error) {
                      console.error('Error:', error);
                      Alert.alert('❌ Error', 'Failed to send notification.');
                    }
                  }
                },
                {
                  text: 'Test Basic Notification',
                  onPress: async () => {
                    try {
                      await sendLocalNotification(
                        'Test Notification',
                        'This is a basic test notification!',
                        { type: 'test' }
                      );
                      Alert.alert('✅ Sent', 'Basic notification sent!');
                    } catch (error) {
                      console.error('Error:', error);
                      Alert.alert('❌ Error', 'Failed to send notification.');
                    }
                  }
                },
                { text: 'Cancel', style: 'cancel' },
                { text: 'Back', onPress: () => handleNotificationSettings() },
              ],
              { cancelable: true }
            );
          }
        },
        { text: 'Back', style: 'cancel', onPress: () => handleAppSettings() },
      ],
      { cancelable: true }
    );
  };

  const handleBlockedUsers = async () => {
    await fetchBlockedUsers();
    
    if (blockedUsers.length === 0) {
      Alert.alert(
        'Blocked Users',
        'You have no blocked users.',
        [
          { text: 'OK', style: 'default' },
          { text: 'Back', onPress: () => handlePrivacySettings() },
        ],
        { cancelable: true }
      );
      return;
    }

    // Show list of blocked users with option to unblock
    const userList = blockedUsers.map(u => u.name).join('\n');
    Alert.alert(
      'Blocked Users',
      `You have ${blockedUsers.length} blocked user(s):\n\n${userList}\n\nTap "Manage" to unblock users.`,
      [
        {
          text: 'Manage',
          onPress: () => {
            // Show unblock options
            const unblockOptions = blockedUsers.map(blockedUser => ({
              text: blockedUser.name,
              onPress: async () => {
                Alert.alert(
                  'Unblock User',
                  `Unblock ${blockedUser.name}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unblock',
                      onPress: async () => {
                        if (!user?.id) return;
                        try {
                          const { error } = await supabase
                            .from('blocked_users')
                            .delete()
                            .eq('user_id', user.id)
                            .eq('blocked_user_id', blockedUser.id);

                          if (error) {
                            Alert.alert('Error', 'Failed to unblock user.');
                          } else {
                            Alert.alert('Success', `${blockedUser.name} has been unblocked.`);
                            await fetchBlockedUsers();
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to unblock user.');
                        }
                      }
                    }
                  ]
                );
              }
            }));

            Alert.alert(
              'Unblock Users',
              'Select a user to unblock:',
              [
                ...unblockOptions,
                { text: 'Cancel', style: 'cancel' },
                { text: 'Back', onPress: () => handleBlockedUsers() },
              ],
              { cancelable: true }
            );
          }
        },
        { text: 'Back', onPress: () => handlePrivacySettings() },
      ],
      { cancelable: true }
    );
  };

  const handlePrivacySettings = () => {
    Alert.alert(
      'Privacy & Safety',
      'Manage your privacy and safety settings',
      [
        { 
          text: 'Profile Visibility', 
          onPress: () => Alert.alert(
            'Profile Visibility',
            'Control who can see your profile and activity levels.\n\nCurrently: Visible to activity members only',
            [{ text: 'OK', style: 'default' }, { text: 'Back', onPress: () => handlePrivacySettings() }],
            { cancelable: true }
          )
        },
        { 
          text: 'Location Sharing', 
          onPress: () => Alert.alert(
            'Location Sharing',
            'Control location sharing for meetups.\n\nCurrently: Approximate location only',
            [{ text: 'OK', style: 'default' }, { text: 'Back', onPress: () => handlePrivacySettings() }],
            { cancelable: true }
          )
        },
        { 
          text: `Block Users${blockedUsers.length > 0 ? ` (${blockedUsers.length})` : ''}`, 
          onPress: handleBlockedUsers
        },
        { 
          text: 'Report Issues', 
          onPress: () => Alert.alert(
            'Report Issues',
            'Report inappropriate behavior or content.\n\nContact: activityhubsercive@gmail.com',
            [{ text: 'OK', style: 'default' }, { text: 'Back', onPress: () => handlePrivacySettings() }],
            { cancelable: true }
          )
        },
        { text: 'Back', style: 'cancel', onPress: () => handleAppSettings() },
      ],
      { cancelable: true }
    );
  };

  const handleAccountSettings = () => {
    Alert.alert(
      'Account Settings',
      'Manage your account preferences',
      [
        { 
          text: 'Change Password', 
          onPress: () => Alert.alert(
            'Change Password',
            'Password changes are currently handled through email reset.\n\nWould you like us to send a reset link?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Send Reset Link', onPress: () => Alert.alert('Reset Link Sent', 'Check your email for password reset instructions.', [{ text: 'OK' }]) },
              { text: 'Back', onPress: () => handleAccountSettings() },
            ],
            { cancelable: true }
          )
        },
        { 
          text: 'Update Email', 
          onPress: () => Alert.alert(
            'Update Email',
            'Email updates require verification.\n\nContact activityhubsercive@gmail.com for assistance.',
            [{ text: 'OK' }, { text: 'Back', onPress: () => handleAccountSettings() }],
            { cancelable: true }
          )
        },
        { 
          text: 'Delete Account', 
          onPress: () => Alert.alert(
            'Delete Account',
            'This will permanently delete your account and all data.\n\nThis action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete Account',
                style: 'destructive',
                onPress: () => Alert.alert(
                  'Account Deletion',
                  'Please contact activityhubsercive@gmail.com to delete your account.',
                  [{ text: 'OK' }]
                )
              },
              { text: 'Back', onPress: () => handleAccountSettings() },
            ],
            { cancelable: true }
          )
        },
        { text: 'Back', style: 'cancel', onPress: () => handleAppSettings() },
      ],
      { cancelable: true }
    );
  };

  const handleTermsAndSafety = () => {
    Alert.alert(
      'Terms & Safety Policies',
      `TERMS OF USE

By using The Activity Hub, you agree to our community guidelines and terms.

ZERO TOLERANCE POLICY
There is zero tolerance for abusive, harmful, or inappropriate content or behavior. Violations will result in immediate account suspension or termination.

REPORTING & RESPONSE
Reports of inappropriate behavior will be reviewed within 24 hours and offending content or user access may be removed.

SAFETY GUIDELINES
• Be respectful and kind to all members
• Report any inappropriate behavior immediately
• Meet in public places for first-time meetups
• Trust your instincts and prioritize your safety

Full Terms: https://bluefodor88.github.io
Privacy Policy: https://bluefodor88.github.io

For support: activityhubsercive@gmail.com`,
      [{ text: 'OK' }]
    );
  };

  const handleAboutApp = () => {
    const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.manifest?.ios?.buildNumber || 'Unknown';
    const version = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
    Alert.alert(
      'About The Activity Hub',
      `Connect with people who share your interests and activity levels.\n\nVersion: ${version}\nBuild: ${buildNumber}\n\nFor support: activityhubsercive@gmail.com\n\nMade with ❤️ for the active community in Portland`,
      [
        { 
          text: 'Privacy Policy', 
          onPress: () => Alert.alert('Privacy Policy', 'Your privacy is important to us. We only collect data necessary to connect you with activity partners.\n\nFull policy: https://bluefodor88.github.io') 
        },
        { 
          text: 'Terms of Service', 
          onPress: () => Alert.alert('Terms of Service', 'By using The Activity Hub, you agree to our community guidelines and terms.\n\nFull terms: https://bluefodor88.github.io') 
        },
        { text: 'Back', onPress: () => handleAppSettings() },
      ]
    );
  };

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
                        onPress={() =>
                          Alert.alert(
                            'Ready Today',
                            "Turn this on if you’re available to join this activity today. It helps others know you’re up for plans now."
                          )
                        }
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
          <Text style={styles.sectionTitle}>When are you available?</Text>
          {availabilityLoading ? (
            <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.availabilityContainer}>
              {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                const daySlots = availability.filter(
                  (slot) => slot.day_of_week === dayIndex
                );
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
                          <TouchableOpacity
                            key={timeBlock}
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
                          </TouchableOpacity>
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
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleAppSettings}>
                <Ionicons name="settings" size={20} color="#333" />
            <Text style={styles.settingText}>App Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleTermsAndSafety}>
            <Ionicons name="shield-checkmark" size={20} color="#333" />
            <Text style={styles.settingText}>Terms & Safety Policies</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleLogout}>
            <Ionicons name="log-out" size={20} color="#F44336" />
            <Text style={[styles.settingText, { color: '#F44336' }]}>Logout</Text>
          </TouchableOpacity>
        </View>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
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
