export interface Profile {
  id: string
  name: string
  email: string
  avatar_url?: string
  created_at?: string
  updated_at?: string
}

export interface Activity {
  id: string
  name: string
  emoji: string
  description: string
  created_at?: string
}

export interface UserActivitySkill {
  id: string
  user_id: string
  activity_id: string
  skill_level: 'Beginner' | 'Intermediate' | 'Advanced'
  ready_today?: boolean
  created_at?: string
  updated_at?: string
  activities?: Activity
}

export interface ForumMessage {
  id: string
  activity_id: string
  user_id: string
  message: string
  created_at?: string
  profiles?: Profile
  activities?: Activity
}

export interface Chat {
  id: string
  participant_1: string
  participant_2: string
  last_message_at?: string
  created_at?: string
}

export interface ChatMessage {
  id: string
  chat_id: string
  sender_id: string
  message: string
  created_at?: string
  profiles?: Profile
}

export interface ScheduledEvent {
  id: string
  organizer_id: string
  activity_id: string | null
  title: string
  location: string
  event_date: string
  event_time: string
  description: string
  max_participants: number
  created_at: string
  updated_at: string
  profiles?: Profile
  activities?: Activity
}

export interface EventParticipant {
  id: string
  event_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
  responded_at?: string
  profiles?: Profile
}

export interface EventInvite {
  id: string
  event_id: string
  title: string
  location: string
  event_date: string
  event_time: string
  organizer_name: string
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
}