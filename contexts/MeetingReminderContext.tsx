import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface MeetingReminderContextType {
  checkUpcomingMeetings: () => void;
}

const MeetingReminderContext = createContext<MeetingReminderContextType | null>(null);

interface MeetingReminderProviderProps {
  children: ReactNode;
}

export function MeetingReminderProvider({ children }: MeetingReminderProviderProps) {
  const { user } = useAuth();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

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

      // Show alert for upcoming meetings (only if we haven't checked recently)
      if (upcomingMeetings.length > 0) {
        const shouldShowAlert = !lastChecked || 
          (now.getTime() - lastChecked.getTime()) > 30 * 60 * 1000; // 30 minutes

        if (shouldShowAlert) {
          const meeting = upcomingMeetings[0]; // Show first upcoming meeting
          const otherPersonName = meeting.sender_id === user.id 
            ? meeting.recipient?.name 
            : meeting.sender?.name;
          
          const meetingDateTime = new Date(`${meeting.event_date}T${meeting.event_time}`);
          const minutesUntil = Math.floor((meetingDateTime.getTime() - now.getTime()) / (1000 * 60));

          Alert.alert(
            '⏰ Meeting Reminder',
            `Your meeting with ${otherPersonName} at ${meeting.location} starts in ${minutesUntil} minutes!`,
            [{ text: 'OK', style: 'default' }]
          );

          setLastChecked(now);
        }
      }
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