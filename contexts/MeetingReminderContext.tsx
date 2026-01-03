import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { sendLocalNotification, scheduleEventNotification, getAllScheduledNotifications, cancelScheduledNotification } from '@/hooks/useNotifications';

interface MeetingReminderContextType {
  checkUpcomingMeetings: () => Promise<void>;
}

const MeetingReminderContext = createContext<MeetingReminderContextType | null>(null);

interface MeetingReminderProviderProps {
  children: ReactNode;
}

export function MeetingReminderProvider({ children }: MeetingReminderProviderProps) {
  const { user } = useAuth();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [notifiedMeetings, setNotifiedMeetings] = useState<Set<string>>(new Set());
  const [scheduledNotificationIds, setScheduledNotificationIds] = useState<Map<string, string>>(new Map());

  // Schedule notifications for all accepted meetings when app loads
  useEffect(() => {
    if (!user) return;

    const scheduleAllAcceptedMeetings = async () => {
      try {
        const { data: meetings, error } = await supabase
          .from('meetup_invites')
          .select(`
            *,
            sender:profiles!meetup_invites_sender_id_fkey(name),
            recipient:profiles!meetup_invites_recipient_id_fkey(name)
          `)
          .eq('status', 'accepted')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

        if (error || !meetings) return;

        // Get existing scheduled notifications
        const existingNotifications = await getAllScheduledNotifications();
        const existingMeetingIds = new Set(
          existingNotifications
            .map(n => n.content.data?.meetingId)
            .filter(Boolean)
        );

        // Schedule notifications for meetings that don't have one yet
        const newScheduledIds = new Map<string, string>();
        for (const meeting of meetings) {
          const meetingId = meeting.id;
          
          // Skip if already scheduled
          if (existingMeetingIds.has(meetingId)) continue;

          const meetingDateTime = new Date(`${meeting.event_date}T${meeting.event_time}`);
          const oneHourBefore = new Date(meetingDateTime.getTime() - 60 * 60 * 1000);
          const now = new Date();

          // Only schedule if the notification time is in the future
          if (oneHourBefore > now) {
            const otherPersonName = meeting.sender_id === user.id 
              ? meeting.recipient?.name 
              : meeting.sender?.name;
            
            const notificationId = await scheduleEventNotification(
              meetingId,
              meeting.event_date,
              meeting.event_time,
              meeting.location,
              otherPersonName || 'Someone'
            );

            if (notificationId) {
              newScheduledIds.set(meetingId, notificationId);
            }
          }
        }

        setScheduledNotificationIds(prev => new Map([...prev, ...newScheduledIds]));
      } catch (error) {
        console.error('Error scheduling meeting notifications:', error);
      }
    };

    scheduleAllAcceptedMeetings();
  }, [user]);

  const checkUpcomingMeetings = async () => {
    if (!user) return;

    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Get all accepted meetings for the user
      const { data: meetings, error } = await supabase
        .from('meetup_invites')
        .select(`
          *,
          sender:profiles!meetup_invites_sender_id_fkey(name),
          recipient:profiles!meetup_invites_recipient_id_fkey(name)
        `)
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

      if (error || !meetings) return;

      // Check for meetings starting within the next hour
      const upcomingMeetings = meetings.filter(meeting => {
        const meetingDateTime = new Date(`${meeting.event_date}T${meeting.event_time}`);
        return meetingDateTime > now && meetingDateTime <= oneHourFromNow;
      });

      // Send notifications for upcoming meetings (only once per meeting)
      if (upcomingMeetings.length > 0) {
        setNotifiedMeetings(prev => {
          const newNotified = new Set(prev);
          
          upcomingMeetings.forEach(meeting => {
            const meetingId = meeting.id;
            
            // Skip if we've already notified about this meeting
            if (newNotified.has(meetingId)) return;
            
            const otherPersonName = meeting.sender_id === user.id 
              ? meeting.recipient?.name 
              : meeting.sender?.name;
            
            const meetingDateTime = new Date(`${meeting.event_date}T${meeting.event_time}`);
            const minutesUntil = Math.floor((meetingDateTime.getTime() - now.getTime()) / (1000 * 60));
            
            // Send push notification
            sendLocalNotification(
              '⏰ Event Reminder',
              `Your meetup with ${otherPersonName} at ${meeting.location} starts in ${minutesUntil} minutes!`,
              { meetingId, type: 'event_reminder' }
            );
            
            // Mark as notified
            newNotified.add(meetingId);
          });
          
          return newNotified;
        });
      }
      
      // Clean up old meeting IDs from notified set (meetings that have passed)
      const currentMeetingIds = new Set(meetings.map(m => m.id));
      setNotifiedMeetings(prev => {
        const cleaned = new Set<string>();
        prev.forEach(id => {
          if (currentMeetingIds.has(id)) {
            cleaned.add(id);
          }
        });
        return cleaned;
      });
    } catch (error) {
      console.error('Error checking upcoming meetings:', error);
    }
  };

  // Check for meetings when the app becomes active
  useEffect(() => {
    if (user) {
      checkUpcomingMeetings();
      
      // Set up interval to check every 5 minutes
      const interval = setInterval(checkUpcomingMeetings, 5 * 60 * 1000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

  const value = {
    checkUpcomingMeetings
  };

  return (
    <MeetingReminderContext.Provider value={value}>
      {children}
    </MeetingReminderContext.Provider>
  );
}

export function useMeetingReminder() {
  const context = useContext(MeetingReminderContext);
  if (!context) {
    throw new Error('useMeetingReminder must be used within a MeetingReminderProvider');
  }
  return context;
}