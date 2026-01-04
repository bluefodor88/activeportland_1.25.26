import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications() {
  const { user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!user) return; // Only request permissions if user is logged in
    
    // Request permissions and register push token
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        console.log('Push notification token:', token);
        // Store the token in the database
        storePushToken(user.id, token).catch(error => {
          console.error('Error storing push token:', error);
        });
      } else {
        console.log('No push token - using local notifications only');
      }
    }).catch(error => {
      console.error('Error registering for notifications:', error);
    });

    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      // You can navigate to the chat here if needed
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  return {
    sendNotification: sendLocalNotification,
  };
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF8C42',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('Expo project ID not found in app.json');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    
    return tokenData.data;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
    return null;
  }
}

/**
 * Store push token in the database
 */
async function storePushToken(userId: string, expoPushToken: string) {
  try {
    // Use upsert to update if token exists, insert if new
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: expoPushToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,expo_push_token',
        }
      );

    if (error) {
      console.error('Error storing push token:', error);
    } else {
      console.log('✅ Push token stored successfully');
    }
  } catch (error) {
    console.error('Error in storePushToken:', error);
  }
}

export async function sendLocalNotification(title: string, body: string, data?: any) {
  try {
    // Ensure Android notification channel is set up
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C42',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Check permissions first
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted. Status:', status);
      // Try requesting again
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.error('Cannot send notification - permissions denied');
        return;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data || {},
      },
      trigger: null, // Show immediately
    });
    
    console.log('✅ Notification sent:', title, body);
  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}

/**
 * Schedule a notification for an event 1 hour before it starts
 * This works even when the app is closed (scheduled notifications)
 */
export async function scheduleEventNotification(
  meetingId: string,
  eventDate: string,
  eventTime: string,
  location: string,
  otherPersonName: string
): Promise<string | null> {
  try {
    // Ensure Android notification channel is set up
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C42',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Check permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.error('Cannot schedule notification - permissions denied');
        return null;
      }
    }

    // Calculate when to show the notification (1 hour before event)
    const eventDateTime = new Date(`${eventDate}T${eventTime}`);
    const notificationTime = new Date(eventDateTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const now = new Date();

    // Only schedule if the notification time is in the future
    if (notificationTime <= now) {
      console.log('Event is too soon or already passed, not scheduling notification');
      return null;
    }

    const secondsUntilNotification = Math.floor((notificationTime.getTime() - now.getTime()) / 1000);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Event Reminder',
        body: `Your meetup with ${otherPersonName} at ${location} starts in 1 hour!`,
        sound: true,
        data: {
          type: 'event_reminder',
          meetingId,
          eventDate,
          eventTime,
          location,
        },
      },
      trigger: {
        seconds: secondsUntilNotification,
      },
    });

    console.log(`✅ Scheduled event notification for ${notificationTime.toLocaleString()}, ID: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('❌ Error scheduling event notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification by ID
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`✅ Cancelled notification ${notificationId}`);
  } catch (error) {
    console.error('❌ Error cancelling notification:', error);
  }
}

/**
 * Get all scheduled notifications (useful for debugging)
 */
export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

