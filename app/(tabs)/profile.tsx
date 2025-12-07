import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useActivities } from '@/hooks/useActivities';
import { supabase } from '@/lib/supabase';
import { useCallback } from 'react';
import { ActivitySelectionModal } from '@/components/ActivitySelectionModal';
import { ICONS } from '@/lib/helperUtils';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, userSkills, loading, uploading, updateSkillLevel, uploadProfileImage, refetch } = useProfile();
  const { activities } = useActivities();
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Refresh profile data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
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
        // Call the hook function
        const response = await uploadProfileImage(result.assets[0].uri);
        
        if (response.success) {
          Alert.alert('Success', 'Profile photo updated!');
        } else {
          Alert.alert('Error', response.error || 'Failed to upload image');
        }
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

  const handleNotificationSettings = () => {
    Alert.alert(
      'Notification Settings',
      'Configure your notification preferences',
      [
        { 
          text: 'Meeting Reminders', 
          onPress: () => Alert.alert('Meeting Reminders', 'Get notified 1 hour before scheduled meetups.\n\nCurrently: Enabled') 
        },
        { 
          text: 'New Messages', 
          onPress: () => Alert.alert('New Messages', 'Get notified when you receive new chat messages.\n\nCurrently: Enabled') 
        },
        { text: 'Back', onPress: () => handleAppSettings() },
      ]
    );
  };

  const handlePrivacySettings = () => {
    Alert.alert(
      'Privacy & Safety',
      'Manage your privacy and safety settings',
      [
        { 
          text: 'Profile Visibility', 
          onPress: () => Alert.alert('Profile Visibility', 'Control who can see your profile and activity levels.\n\nCurrently: Visible to activity members only') 
        },
        { 
          text: 'Location Sharing', 
          onPress: () => Alert.alert('Location Sharing', 'Control location sharing for meetups.\n\nCurrently: Approximate location only') 
        },
        { 
          text: 'Block Users', 
          onPress: () => Alert.alert('Block Users', 'Manage blocked users.\n\nCurrently: No blocked users') 
        },
        { 
          text: 'Report Issues', 
          onPress: () => Alert.alert('Report Issues', 'Report inappropriate behavior or content.\n\nContact: support@activityhub.com') 
        },
        { text: 'Back', onPress: () => handleAppSettings() },
      ]
    );
  };

  const handleAccountSettings = () => {
    Alert.alert(
      'Account Settings',
      'Manage your account preferences',
      [
        { 
          text: 'Change Password', 
          onPress: () => Alert.alert('Change Password', 'Password changes are currently handled through email reset.\n\nWould you like us to send a reset link?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send Reset Link', onPress: () => Alert.alert('Reset Link Sent', 'Check your email for password reset instructions.') }
          ]) 
        },
        { 
          text: 'Update Email', 
          onPress: () => Alert.alert('Update Email', 'Email updates require verification.\n\nContact support@activityhub.com for assistance.') 
        },
        { 
          text: 'Delete Account', 
          onPress: () => Alert.alert('Delete Account', 'This will permanently delete your account and all data.\n\nThis action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Account', style: 'destructive', onPress: () => Alert.alert('Account Deletion', 'Please contact support@activityhub.com to delete your account.') }
          ]) 
        },
        { text: 'Back', onPress: () => handleAppSettings() },
      ]
    );
  };

  const handleAboutApp = () => {
    Alert.alert(
      'About The Activity Hub',
      'Connect with people who share your interests and activity levels.\n\nVersion: 1.0.0\nBuild: 40\n\nFor support: support@activeportland.com\n\nMade with ❤️ for the active community in Portland',
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
          <View style={styles.addButtonContainer}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowActivityModal(true)}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.addButtonText}>Add Activity</Text>
            </TouchableOpacity>
          </View>
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
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveActivity(userSkill.activity_id, userSkill.activities!.name)}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {userSkills.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.noActivitiesText}>
                No activities selected yet.
              </Text>
              <TouchableOpacity
                style={styles.addFirstButton}
                onPress={() => setShowActivityModal(true)}
              >
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.addFirstButtonText}>Add Your First Activity</Text>
              </TouchableOpacity>
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
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleAppSettings}>
                <Ionicons name="settings" size={20} color="#333" />
            <Text style={styles.settingText}>App Settings</Text>
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
  addButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 20,
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
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  skillItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  skillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginLeft: 8,
    marginRight: 12,
    flex: 1,
  },
  activityEmoji: {
    fontSize: 20,
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
  removeButton: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#f44336',
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
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
});