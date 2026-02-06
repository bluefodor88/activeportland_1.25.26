import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
  NativeModules,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageView from "react-native-image-viewing";
import { useLocalSearchParams, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateChat, useChats } from '@/hooks/useChats';
import { supabase } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ParticipantSelector } from '@/components/ParticipantSelector';
import { useActivities } from '@/hooks/useActivities';
import { useEventParticipants } from '@/hooks/useEventParticipants';
import { scheduleEventNotification } from '@/hooks/useNotifications';
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';

const TIME_ITEM_HEIGHT = 44;

interface Participant {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [eventLocation, setEventLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [acceptedMeetings, setAcceptedMeetings] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedParticipants, setSelectedParticipants] = useState<Participant[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('5');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [selectedActivityName, setSelectedActivityName] = useState<string>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [locationMode, setLocationMode] = useState<'manual' | 'gps'>('manual');

  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINUTES = ['00','15','30','45'];
  const AMPM: Array<'AM' | 'PM'> = ['AM','PM'];
  const [isLocating, setIsLocating] = useState(false);

  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showUserActionsModal, setShowUserActionsModal] = useState(false);
  
  const { user } = useAuth();
  const { markAsRead, setActiveChat } = useChats();
  const { messages, loading: messagesLoading, error: messagesError, sendMessage } = useChatMessages(chatId);
  const { activities } = useActivities();
  const { inviteParticipants } = useEventParticipants();
  const flatListRef = useRef<FlatList>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });

    if (!result.canceled) {
      // result.assets contains the array of selected images
      const uris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...uris]);
    }
  };

  const openGallery = (imageUrls: string[], index: number) => {
    const formattedImages = imageUrls.map(url => ({ uri: url }));
    setGalleryImages(formattedImages);
    setGalleryIndex(index);
    setIsGalleryVisible(true);
  };

  const handleDateChange = (_event: any, date?: Date) => {
    if (date) {
      setSelectedDateObj(date);
      setSelectedDate(date.toISOString().split('T')[0]);
      setShowDatePicker(false);
    }
  };

  const getSelectedDateLabel = () => {
    if (!selectedDate) return 'Select a date';
    const date = selectedDateObj ? selectedDateObj : new Date(selectedDate);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const to24Hour = (hour12: number, ampm: 'AM' | 'PM') => {
    if (ampm === 'AM') {
      return hour12 === 12 ? 0 : hour12;
    }
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const getNearestTimeSelection = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    const rounded = new Date(now);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    if (roundedMinutes === 60) {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0);
    } else {
      rounded.setMinutes(roundedMinutes);
    }

    // Clamp to 5:00 AM - 10:45 PM
    const min = new Date(now);
    min.setHours(5, 0, 0, 0);
    const max = new Date(now);
    max.setHours(22, 45, 0, 0);

    let target = rounded;
    if (target < min) target = min;
    if (target > max) target = max;

    const hour24 = target.getHours();
    const minute = target.getMinutes();
    const ampm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    return {
      hour: hour12.toString(),
      minute: minute.toString().padStart(2, '0'),
      ampm,
    };
  };

  const getSelectedTimeLabel = () => {
    if (!selectedTime) return 'Select a time';
    const [h, m] = selectedTime.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const openTimePicker = () => {
    if (selectedTime) {
      const [h, m] = selectedTime.split(':').map(Number);
      const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      setSelectedHour(hour12.toString());
      setSelectedMinute(m.toString().padStart(2, '0'));
      setSelectedAmPm(ampm);
    } else {
      const nearest = getNearestTimeSelection();
      setSelectedHour(nearest.hour);
      setSelectedMinute(nearest.minute);
      setSelectedAmPm(nearest.ampm);
    }
    setShowTimePicker(true);
  };

  const confirmTimeSelection = () => {
    if (!selectedDate) {
      Alert.alert('Select a Date', 'Please choose a date first.');
      return;
    }
    const hour24 = to24Hour(parseInt(selectedHour, 10), selectedAmPm);
    const timeValue = `${hour24.toString().padStart(2, '0')}:${selectedMinute}`;
    const dateObj = selectedDateObj || new Date(selectedDate);
    const selectedDateTime = new Date(dateObj);
    selectedDateTime.setHours(hour24, parseInt(selectedMinute, 10), 0, 0);

    const now = new Date();
    const selectedDateKey = dateObj.toISOString().split('T')[0];
    const todayKey = now.toISOString().split('T')[0];
    if (selectedDateKey === todayKey && selectedDateTime <= now) {
      Alert.alert('Choose a Future Time', 'Please select a time in the future.');
      return;
    }

    setSelectedTime(timeValue);
    setShowTimePicker(false);
  };

  const filteredActivities = activities
    .filter(a => a?.name)
    .filter(a => a.name.toLowerCase().includes(activitySearch.trim().toLowerCase()));

  const selectActivity = (activity: { id: string; name: string }) => {
    setSelectedActivityId(activity.id);
    setSelectedActivityName(activity.name);
    setShowActivityPicker(false);
  };

  const handleReportUser = () => {
    setShowUserActionsModal(false);
    const userId = id;
    const userName = name || 'User';
    
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

  const handleBlockUser = async () => {
    if (!user) return;
    setShowUserActionsModal(false);
    
    const userId = id;
    const userName = name || 'User';

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
              // Create a blocked_users record
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
                Alert.alert('User Blocked', `${userName} has been blocked.`, [
                  { text: 'OK', onPress: () => router.back() }
                ]);
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

  // Combine all data for FlatList (memoized to prevent memory leaks)
  const combinedData = useMemo(() => {
    const data: any[] = [];
    
    // Add accepted meetings first
    acceptedMeetings.forEach((meeting) => {
      data.push({
        id: `meeting-${meeting.id}`,
        type: 'acceptedMeeting',
        data: meeting,
        timestamp: new Date(meeting.event_date + 'T' + meeting.event_time).getTime()
      });
    });
    
    // Add pending invites
    pendingInvites.forEach((invite) => {
      data.push({
        id: `invite-${invite.id}`,
        type: 'invite',
        data: invite,
        timestamp: new Date(invite.created_at).getTime()
      });
    });
    
    // Add messages
    messages.forEach((message) => {
      data.push({
        id: `message-${message.id}`,
        type: 'message',
        data: message,
        timestamp: new Date(message.created_at).getTime()
      });
    });
    
    // Sort by timestamp
    return data.sort((a, b) => a.timestamp - b.timestamp);
  }, [acceptedMeetings, pendingInvites, messages]);

  // Render item for FlatList
  const renderItem = ({ item }: { item: any }) => {
    switch (item.type) {
      case 'acceptedMeeting':
        return renderAcceptedMeeting({ item: item.data });
      case 'invite':
        return renderInvite({ item: item.data });
      case 'message':
        return renderMessage({ item: item.data });
      default:
        return null;
    }
  };

  const fetchPendingInvites = async () => {
    if (!chatId || !user) return;

    try {
      const { data, error } = await supabase
        .from('meetup_invites')
        .select(`
          *,
          sender:profiles!meetup_invites_sender_id_fkey(name),
          recipient:profiles!meetup_invites_recipient_id_fkey(name)
        `)
        .eq('chat_id', chatId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPendingInvites(data);
      }
    } catch (error) {
      console.error('Error fetching pending invites:', error);
    }
  };

  const fetchAcceptedMeetings = async () => {
    if (!chatId || !user) return;

    try {
      const { data, error } = await supabase
        .from('meetup_invites')
        .select(`
          *,
          sender:profiles!meetup_invites_sender_id_fkey(name),
          recipient:profiles!meetup_invites_recipient_id_fkey(name)
        `)
        .eq('chat_id', chatId)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Filter out meetings that have already passed
        const now = new Date();
        const upcomingMeetings = data.filter(meeting => {
          const meetingDateTime = new Date(`${meeting.event_date}T${meeting.event_time}`);
          return meetingDateTime > now;
        });
        setAcceptedMeetings(upcomingMeetings);
      }
    } catch (error) {
      console.error('Error fetching accepted meetings:', error);
    }
  };

  const initializeChat = async () => {
    if (!id || !user) {
      setError('Missing user information');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resultChatId = await getOrCreateChat(user.id, id);
      
      if (resultChatId) {
        setChatId(resultChatId);
      } else {
        setError('Failed to create or find chat');
      }
    } catch (error) {
      console.error('Error initializing chat:', error);
      setError('Error initializing chat');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    // Check if BOTH text and images are empty
    if ((!newMessage.trim() && selectedImages.length === 0) || !chatId || !user) {
      return;
    }

    if (isSending) return;

    if (newMessage.trim().length > 1000) {
      Alert.alert('Message Too Long', 'Please keep messages under 1000 characters');
      return;
    }

    if ((!newMessage.trim() && !selectedImages) || !chatId || !user) {
      return;
    }

    try {
      setIsSending(true);

      const success = await sendMessage(newMessage, selectedImages);
      if (success) {
        setNewMessage('');
        setSelectedImages([]);
        // Scroll to bottom after sending message
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleScheduleEvent = async () => {
    if (!eventLocation?.trim() || !selectedDate || !selectedTime || !user || !chatId || !id) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    try {
      setIsInviting(true);
      // Create the meetup invite
      const { data: inviteData, error } = await supabase
        .from('meetup_invites')
        .insert({
          sender_id: user.id,
          recipient_id: id,
          chat_id: chatId,
          location: eventLocation.trim(),
          event_date: selectedDate,
          event_time: selectedTime,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating event:', error);
        Alert.alert('Error', 'Failed to send invite. Please try again.');
        return;
      }

      // If additional participants are selected, create a scheduled event and invite them
      if (selectedParticipants.length > 0 && inviteData) {
        // Create a scheduled event for the group
        const { data: eventData, error: eventError } = await supabase
          .from('scheduled_events')
          .insert({
            organizer_id: user.id,
            activity_id: selectedActivityId || null,
            title: `Meetup at ${eventLocation.trim()}`,
            location: eventLocation.trim(),
            event_date: selectedDate,
            event_time: selectedTime,
            description: selectedActivityName
              ? `Group meetup for ${selectedActivityName}`
              : `Group meetup organized from chat with ${name}`,
            max_participants: selectedParticipants.length + 2, // +2 for organizer and original chat partner
          })
          .select('id')
          .single();

        if (!eventError && eventData) {
          // Invite the additional participants
          const participantIds = selectedParticipants.map(p => p.id);
          await inviteParticipants(eventData.id, participantIds);
        }
      }
      
      Alert.alert('Success!', 'Invite sent successfully');
      setEventLocation('');
      setSelectedDate('');
      setSelectedTime('');
      setSelectedActivityId('');
      setSelectedActivityName('');
      setSelectedParticipants([]);
      setShowScheduleModal(false);
      fetchPendingInvites(); // Refresh invites
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to send invite. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (isLocating) return;

    try {
      setLocationMode('gps');
      setIsLocating(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow location access to use your current location.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (place) {
        const street = place.street || place.name;
        const city = place.city;
        const parts = [street, city].filter(Boolean);
        const formatted = parts.length > 0
          ? parts.join(', ')
          : `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`;
        setEventLocation(formatted);
      } else {
        setEventLocation(
          `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
        );
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Unable to get your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  const selectLocationMode = async (mode: 'manual' | 'gps') => {
    setLocationMode(mode);
    if (mode === 'gps') {
      await handleUseCurrentLocation();
    } else {
      setEventLocation('');
    }
  };

  const handleInviteResponse = async (inviteId: string, status: 'accepted' | 'declined') => {
    if (!inviteId?.trim()) {
      Alert.alert('Error', 'Invalid invite ID');
      return;
    }

    try {
      // Get meeting details before updating (needed for scheduling notification)
      let meetingData: any = null;
      if (status === 'accepted') {
        const { data } = await supabase
          .from('meetup_invites')
          .select(`
            *,
            sender:profiles!meetup_invites_sender_id_fkey(name),
            recipient:profiles!meetup_invites_recipient_id_fkey(name)
          `)
          .eq('id', inviteId)
          .single();
        meetingData = data;
      }

      const { error } = await supabase
        .from('meetup_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) {
        console.error('Error responding to invite:', error);
        Alert.alert('Error', 'Failed to respond to invite');
        return;
      }

      const statusText = status === 'accepted' ? 'accepted' : 'declined';
      Alert.alert('Success!', `Invite ${statusText} successfully`);
      fetchPendingInvites(); // Refresh invites
      if (status === 'accepted') {
        fetchAcceptedMeetings(); // Refresh accepted meetings
        
        // Schedule notification 1 hour before the event
        if (meetingData && user) {
          const otherPersonName = meetingData.sender_id === user.id 
            ? meetingData.recipient?.name 
            : meetingData.sender?.name;
          
          await scheduleEventNotification(
            meetingData.id,
            meetingData.event_date,
            meetingData.event_time,
            meetingData.location,
            otherPersonName || name
          );
        }
      }
    } catch (error) {
      console.error('Error responding to invite:', error);
      Alert.alert('Error', 'Failed to respond to invite');
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageText = (text: string, isMe: boolean) => {
    // Split text by URLs (starts with http:// or https://)
    const parts = text.split(/(https?:\/\/[^\s]+)/g);

    return parts.map((part, index) => {
      // If this part is a URL
      if (/(https?:\/\/[^\s]+)/g.test(part)) {
        return (
          <Text
            key={index}
            style={{
              textDecorationLine: 'underline',
              color: isMe ? 'white' : '#0000EE',
              fontWeight: 'bold'
            }}
            onPress={() => Linking.openURL(part)}
          >
            {part}
          </Text>
        );
      }
      // Normal text
      return <Text key={index}>{part}</Text>;
    });
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender_id === user?.id;
    const hasImages = item.image_urls && item.image_urls.length > 0;
    
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
        {/* Render Image Gallery */}
        {hasImages && (
          <View style={styles.imageGrid}>
            {item.image_urls.map((url: string, index: number) => (
              <TouchableOpacity 
                key={index}
                onPress={() => openGallery(item.image_urls, index)}
                activeOpacity={0.9}
              >
                <Image 
                  source={{ uri: url }} 
                  style={[
                    styles.messageImage, 
                    item.image_urls.length > 1 ? styles.gridImage : styles.singleImage
                  ]} 
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        {item.message ? (
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
             {renderMessageText(item.message, isMe)}
        </Text>
        ) : null}
        
        <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
          {formatTime(item.created_at)}
        </Text>
      </View>
    );
  };

  const renderInvite = ({ item }: { item: any }) => {
    const isMyInvite = item.sender_id === user?.id;
    const senderName = item.sender?.name || 'Unknown';
    const recipientName = item.recipient?.name || 'Unknown';
    
    return (
      <View style={styles.inviteContainer}>
        <View style={styles.inviteHeader}>
          <Text style={styles.inviteTitle}>
            {isMyInvite ? `Invite sent to ${recipientName}` : `Invite from ${senderName}`}
          </Text>
          <Text style={styles.inviteStatus}>Pending</Text>
        </View>
        
        <View style={styles.inviteDetails}>
          <Text style={styles.inviteLocation}>📍 {item.location}</Text>
          <Text style={styles.inviteDateTime}>
            📅 {new Date(item.event_date).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })} at {new Date(`2000-01-01T${item.event_time}`).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </Text>
        </View>

        {!isMyInvite && (
          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleInviteResponse(item.id, 'accepted')}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleInviteResponse(item.id, 'declined')}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderAcceptedMeeting = ({ item }: { item: any }) => {
    const isMyMeeting = item.sender_id === user?.id;
    const senderName = item.sender?.name || 'Unknown';
    const recipientName = item.recipient?.name || 'Unknown';
    
    // Calculate time until meeting
    const meetingDateTime = new Date(`${item.event_date}T${item.event_time}`);
    const timeDiff = meetingDateTime.getTime() - currentTime.getTime();
    const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Determine reminder status
    let reminderText = '';
    let reminderStyle = {};
    
    if (timeDiff <= 0) {
      // Meeting has passed - this shouldn't show due to filtering, but just in case
      return null;
    } else if (hoursUntil === 0 && minutesUntil <= 60) {
      // Meeting is within the next hour
      reminderText = `🚨 Starting in ${minutesUntil} minutes!`;
      reminderStyle = { backgroundColor: '#FFEBEE', borderLeftColor: '#F44336' };
    } else if (hoursUntil === 1 && minutesUntil <= 60) {
      // Meeting is in about 1 hour
      reminderText = `⏰ Starting in 1 hour!`;
      reminderStyle = { backgroundColor: '#FFF3E0', borderLeftColor: '#FF9800' };
    } else if (hoursUntil < 24) {
      // Meeting is today
      reminderText = `📅 Today in ${hoursUntil} hours`;
      reminderStyle = { backgroundColor: '#E8F5E8', borderLeftColor: '#4CAF50' };
    } else {
      // Meeting is more than a day away
      const daysUntil = Math.floor(hoursUntil / 24);
      reminderText = `📅 In ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
      reminderStyle = { backgroundColor: '#E8F5E8', borderLeftColor: '#4CAF50' };
    }
    
    return (
      <View style={[styles.acceptedMeetingContainer, reminderStyle]}>
        <View style={styles.meetingHeader}>
          <Text style={styles.meetingTitle}>
            ✅ Meeting Confirmed
          </Text>
          <Text style={styles.reminderText}>{reminderText}</Text>
          <Text style={styles.meetingParticipants}>
            {senderName} & {recipientName}
          </Text>
        </View>
        
        <View style={styles.meetingDetails}>
          <Text style={styles.meetingLocation}>📍 {item.location}</Text>
          <Text style={styles.meetingDateTime}>
            📅 {new Date(item.event_date).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })} at {new Date(`2000-01-01T${item.event_time}`).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    initializeChat();
    if (chatId) {
      fetchPendingInvites();
    }
  }, [id, user]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setShowDatePicker(false);
    }
  }, []);

  const hasNativeDatePicker = !!NativeModules.RNDateTimePicker;

  useEffect(() => {
    if (chatId) {
      fetchPendingInvites();
      fetchAcceptedMeetings();
      markAsRead(chatId);
    }
  }, [chatId]);

  // Update current time every minute for countdown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to bottom when messages change (debounced to prevent excessive calls)
  useEffect(() => {
    if (combinedData && combinedData.length > 0 && flatListRef.current) {
      const timeoutId = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [combinedData?.length || 0]);

  // 1. Set this chat as "Active" so badges stay hidden while we are here
  useEffect(() => {
    if (chatId) {
      setActiveChat(chatId);
    }
    // Cleanup: When leaving the screen, clear the active chat
    return () => {
      setActiveChat(null);
    };
  }, [chatId]);

  // 2. Whenever a NEW message arrives (messages array changes), mark it as read immediately
  useEffect(() => {
    if (chatId && messages.length > 0) {
      markAsRead(chatId);
    }
  }, [messages.length, chatId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !chatId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || 'Failed to create chat'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeChat}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
        <View style={styles.headerActions}>
        <TouchableOpacity 
          style={styles.scheduleButton} 
          onPress={() => setShowScheduleModal(true)}
        >
                <Ionicons name="calendar" size={24} color="#FF8C42" />
            <Text style={styles.scheduleButtonText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={() => setShowUserActionsModal(true)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#333" />
        </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messagesLoading ? (
          <View style={styles.centerContainer}>
            <LoadingSpinner size={32} />
            <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading messages...</Text>
          </View>
        ) : messagesError ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{messagesError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => initializeChat()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : messages.length > 0 || pendingInvites.length > 0 ? (
          <FlatList
            ref={flatListRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            data={combinedData || []}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            onContentSizeChange={() => {
              // Only scroll if we're near the bottom
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
            }}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>
              Send a message to {name} to begin chatting
            </Text>
          </View>
        )}

        
          <View style={styles.inputWrapper}>
            {selectedImages?.length > 0 && (
              <ScrollView horizontal contentContainerStyle={styles.previewContainer} showsHorizontalScrollIndicator={false}>
                {selectedImages?.map((uri, index) => (
                  <View key={index} style={styles.previewItem}>
                    <Image source={{ uri }} style={styles.previewImage} />
                    <TouchableOpacity 
                      style={styles.removeImageButton} 
                      onPress={() => setSelectedImages(imgs => imgs.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
        <View style={styles.inputContainer}>
              <TouchableOpacity style={[styles.sendButton, {marginRight: 10}]} onPress={pickImage}>
                <Ionicons name="add-circle" size={28} color="white" />
              </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            maxLength={1000}
            multiline
          />
          <TouchableOpacity 
              style={[
                styles.sendButton,
                ((!newMessage.trim() && selectedImages.length === 0) ||
                  isSending) &&
                  styles.sendButtonDisabled,
              ]}
            onPress={handleSendMessage}
              disabled={
                (!newMessage.trim() && selectedImages.length === 0) || isSending
              }
          >
              {isSending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={20} color="white" />
              )}
          </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showScheduleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Let's make a plan?</Text>
            <View style={styles.modalTitleSpacer} />
            
            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Activity</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowActivityPicker(true)}
                >
                  <Ionicons
                    name="flash-outline"
                    size={18}
                    color={selectedActivityName ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedActivityName && styles.datePickerPlaceholder]}>
                    {selectedActivityName || 'Select an activity'}
                  </Text>
                </TouchableOpacity>
                {showActivityPicker && (
                  <View style={styles.activityPicker}>
                    <View style={styles.searchContainer}>
                      <TextInput
                        style={styles.searchInput}
                        value={activitySearch}
                        onChangeText={setActivitySearch}
                        placeholder="Search activities"
                        placeholderTextColor="#999"
                      />
                    </View>
                    <ScrollView style={styles.activityList} nestedScrollEnabled>
                      {filteredActivities.map((activity) => (
                        <TouchableOpacity
                          key={activity.id}
                          style={styles.activityOption}
                          onPress={() => selectActivity(activity)}
                        >
                          <Text style={styles.activityOptionText}>{activity.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredActivities.length === 0 && (
                        <View style={styles.noResultsContainer}>
                          <Text style={styles.noResultsText}>No activities found</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Location</Text>
                <View style={styles.locationModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.locationModePill,
                      locationMode === 'manual' && styles.locationModePillActive
                    ]}
                    onPress={() => selectLocationMode('manual')}
                  >
                    <Text
                      style={[
                        styles.locationModeText,
                        locationMode === 'manual' && styles.locationModeTextActive
                      ]}
                    >
                      Enter manually
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.locationModePill,
                      locationMode === 'gps' && styles.locationModePillActive
                    ]}
                    onPress={() => selectLocationMode('gps')}
                  >
                    <Text
                      style={[
                        styles.locationModeText,
                        locationMode === 'gps' && styles.locationModeTextActive
                      ]}
                    >
                      Use GPS
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.modalTextInput, styles.locationInput]}
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder={locationMode === 'gps' ? 'Fetching location...' : 'Enter location'}
                    placeholderTextColor="#999"
                    editable={locationMode === 'manual'}
                  />
                  <TouchableOpacity
                    style={[styles.gpsButton, isLocating && styles.gpsButtonDisabled]}
                    onPress={() => {
                      if (locationMode === 'manual') {
                        Keyboard.dismiss();
                        return;
                      }
                      handleUseCurrentLocation();
                    }}
                    disabled={isLocating}
                  >
                    {isLocating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons
                        name={locationMode === 'manual' ? 'arrow-forward' : 'location'}
                        size={18}
                        color="white"
                      />
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.locationHint}>
                  * Use GPS to auto-fill your current location.
                </Text>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      Alert.alert('Not supported on web', 'Please use the iOS or Android app to pick a date.');
                      return;
                    }
                    setShowDatePicker(true);
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={selectedDate ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedDate && styles.datePickerPlaceholder]}>
                    {getSelectedDateLabel()}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && Platform.OS !== 'web' && (
                  <Modal
                    visible={showDatePicker}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowDatePicker(false)}
                  >
                    <TouchableOpacity
                      style={styles.datePickerOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        style={styles.datePickerModal}
                        onPress={() => {}}
                      >
                        <DateTimePicker
                          value={selectedDateObj || new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                          minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
                          onChange={handleDateChange}
                          style={styles.datePickerNative}
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity
                            style={styles.datePickerDoneButton}
                            onPress={() => setShowDatePicker(false)}
                          >
                            <Text style={styles.datePickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Time</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={openTimePicker}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={selectedTime ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedTime && styles.datePickerPlaceholder]}>
                    {getSelectedTimeLabel()}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Bring someone along?</Text>
                <Text style={styles.inputSubLabel}>
                  Add up to 7 people to join this meetup
                </Text>
                <View style={styles.alreadyInvitedRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.alreadyInvitedText}>
                    Already invited: {name || 'Chat partner'}
                  </Text>
                </View>
                <ParticipantSelector
                  selectedParticipants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
                  maxParticipants={7}
                  excludedUserIds={[user?.id || '', id]}
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.scheduleConfirmButton, isInviting && { opacity: 0.7 }]}
                onPress={handleScheduleEvent}
                disabled={isInviting}
              >
                {
                  isInviting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                <Text style={styles.scheduleConfirmText}>Send Invite</Text>
                  )
                }
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowScheduleModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {showTimePicker && (
              <View style={styles.timePickerOverlayInline} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.timePickerOverlayTap}
                  activeOpacity={1}
                  onPress={() => setShowTimePicker(false)}
                />
                <View style={styles.timePickerModal}>
                  <Text style={styles.timePickerTitle}>Select time</Text>
                  <View style={styles.timePickerColumns}>
                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={HOURS}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={HOURS.indexOf(selectedHour)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = HOURS[Math.max(0, Math.min(index, HOURS.length - 1))];
                            setSelectedHour(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = HOURS.indexOf(selectedHour);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedHour;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedHour(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>

                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={MINUTES}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={MINUTES.indexOf(selectedMinute)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = MINUTES[Math.max(0, Math.min(index, MINUTES.length - 1))];
                            setSelectedMinute(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = MINUTES.indexOf(selectedMinute);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedMinute;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedMinute(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>

                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={AMPM}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={AMPM.indexOf(selectedAmPm)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = AMPM[Math.max(0, Math.min(index, AMPM.length - 1))];
                            setSelectedAmPm(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = AMPM.indexOf(selectedAmPm);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedAmPm;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedAmPm(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>
                  </View>

                  <View style={styles.timePickerActions}>
                    <TouchableOpacity
                      style={styles.timePickerCancel}
                      onPress={() => setShowTimePicker(false)}
                    >
                      <Text style={styles.timePickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timePickerConfirm}
                      onPress={confirmTimeSelection}
                    >
                      <Text style={styles.timePickerConfirmText}>Set Time</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={isGalleryVisible}
        onRequestClose={() => setIsGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />

      <Modal
        visible={showUserActionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUserActionsModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUserActionsModal(false)}
        >
          <View style={styles.userActionsModalContent}>
            <TouchableOpacity
              style={styles.userActionButton}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color="#666" />
              <Text style={styles.userActionText}>Report User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.userActionButton, styles.blockActionButton]}
              onPress={handleBlockUser}
            >
              <Ionicons name="ban-outline" size={20} color="#F44336" />
              <Text style={[styles.userActionText, { color: '#F44336' }]}>Block User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.userActionCancelButton}
              onPress={() => setShowUserActionsModal(false)}
            >
              <Text style={styles.userActionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  scheduleButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  userActionsModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 8,
    margin: 20,
    minWidth: 200,
    alignSelf: 'flex-end',
    marginTop: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  userActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  blockActionButton: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  userActionText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  userActionCancelButton: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  userActionCancelText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  keyboardContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF8C42',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 4,
  },
  myMessageText: {
    color: 'white',
  },
  otherMessageText: {
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  myTimestamp: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    alignItems: 'flex-end',
  },
  textInput: {
    fontFamily: 'Inter_400Regular',
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#77A6F7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalTitleSpacer: {
    height: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalScrollView: {
    maxHeight: 420,
  },
  modalScrollContent: {
    paddingBottom: 0,
  },
  formInputContainer: {
    marginBottom: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  locationModePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f7f7f7',
  },
  locationModePillActive: {
    borderColor: '#FF8C42',
    backgroundColor: '#FFF3E0',
  },
  locationModeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  locationModeTextActive: {
    color: '#FF8C42',
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 8,
  },
  inputSubLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 12,
  },
  alreadyInvitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3FFF5',
    borderWidth: 1,
    borderColor: '#CDEFD5',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  alreadyInvitedText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#2E7D32',
  },
  modalTextInput: {
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
    flex: 1,
  },
  locationInput: {
    marginRight: 10,
  },
  gpsButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsButtonDisabled: {
    opacity: 0.7,
  },
  locationHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginTop: 6,
  },
  selectorScrollView: {
    maxHeight: 50,
  },
  selectorOption: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#FF8C42',
  },
  selectorText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  selectedText: {
    color: 'white',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  datePickerText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  datePickerPlaceholder: {
    color: '#999',
  },
  activityPicker: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
  },
  activityList: {
    maxHeight: 180,
  },
  activityOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
  },
  activityOptionText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  datePickerContainer: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 8,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  datePickerModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
  },
  datePickerNative: {
    height: 320,
  },
  datePickerDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  datePickerDoneText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  timePickerModal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    zIndex: 2,
  },
  timePickerOverlayInline: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerOverlayTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  timePickerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  timePickerColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  timePickerColumn: {
    flex: 1,
  },
  timePickerWheel: {
    height: 220,
    borderRadius: 14,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EEE',
    overflow: 'hidden',
  },
  timePickerLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  timePickerList: {
    paddingVertical: 88,
  },
  timePickerCenterHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 88,
    height: TIME_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FFE0C2',
    backgroundColor: 'rgba(255, 140, 66, 0.08)',
  },
  timePickerItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  timePickerItemSelected: {
    backgroundColor: '#FFF3E0',
  },
  timePickerItemText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  timePickerItemTextSelected: {
    color: '#FF8C42',
  },
  timePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  timePickerCancel: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timePickerCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  timePickerConfirm: {
    backgroundColor: '#FF8C42',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  timePickerConfirmText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  modalButtons: {
    marginTop: 2,
  },
  scheduleConfirmButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleConfirmText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  placeholder: {
    width: 40,
  },
  inviteContainer: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#1565C0',
    flex: 1,
  },
  inviteStatus: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inviteDetails: {
    marginBottom: 12,
  },
  inviteLocation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 4,
  },
  inviteDateTime: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  acceptText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  declineButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  declineText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  acceptedMeetingContainer: {
    backgroundColor: '#E8F5E8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  meetingHeader: {
    marginBottom: 8,
  },
  meetingTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  meetingParticipants: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#388E3C',
  },
  reminderText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  meetingDetails: {
    marginTop: 8,
  },
  meetingLocation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 4,
  },
  meetingDateTime: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inputWrapper: {
    backgroundColor: 'white',
    // paddingBottom: Platform.OS === 'ios' ? 20 : 0, // specialized padding
  },
  previewContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachButton: {
    marginRight: 10,
    justifyContent: 'center',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  messageImage: {
    borderRadius: 8,
    backgroundColor: '#e1e4e8',
    marginBottom: 4,
  },
  singleImage: {
    width: 200,
    height: 200,
    resizeMode: 'cover',
  },
  gridImage: {
    width: 100, 
    height: 100,
    resizeMode: 'cover',
  },
  previewItem: {
    marginRight: 10,
    position: 'relative',
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
});
