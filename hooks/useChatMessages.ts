import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native';

interface ChatMessage {
  id: string
  chat_id: string
  sender_id: string
  message: string
  created_at: string
}

export function useChatMessages(chatId: string | null) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (chatId) {
      setLoading(true)
      setError(null)
      fetchMessages()
      
      // Set up real-time subscription for new messages
      const subscription = supabase
        .channel(`chat_messages_${chatId}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_messages',
            filter: `chat_id=eq.${chatId}`
          }, 
          () => {
            fetchMessages() // Refresh messages when new ones are added
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to chat messages')
            setError(null) // Clear any previous errors
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('Realtime subscription issue:', status)
            // Don't set error - messages will still load via polling
            // Real-time is a nice-to-have, not critical
          }
        })

      return () => {
        try {
          subscription.unsubscribe()
        } catch (error) {
          console.error('Error unsubscribing from chat messages:', error)
        }
      }
    } else {
      setMessages([])
      setLoading(false)
      setError(null)
    }
  }, [chatId])

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need photo gallery permissions to send photo.'
      );
      return false;
    }
    return true;
  };

  const uploadImage = async (uri: string) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      // 1. Fetch the file URI
      const response = await fetch(uri)
      
      // 2. Convert to ArrayBuffer (Fixes the 0 byte issue)
      const arrayBuffer = await response.arrayBuffer()
      
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
      
      // 3. Upload the ArrayBuffer
      const { data, error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/png',
          upsert: true
        })

      if (error) {
        console.error('Supabase storage upload error:', error)
        throw error
      }
      
      const { data: publicUrlData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName)
        
      return publicUrlData.publicUrl
    } catch (error) {
      console.error('Upload failed:', error)
      return null
    }
  }

  const fetchMessages = async () => {
    if (!chatId) return

    // setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching chat messages:', error)
        setError('Failed to load messages')
        setMessages([])
      } else {
        setMessages(data || [])
        setError(null) // Clear any errors when messages load successfully
      }
    } catch (error) {
      console.error('Error fetching chat messages:', error)
      setError('Network error - please check your connection')
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (message: string, imageUris: string[] = []): Promise<boolean> => {
    if (!chatId || !user || (!message.trim() && imageUris.length === 0)) {
      return false
    }

    try {
      // Upload all images in parallel
      const uploadPromises = imageUris.map(uri => uploadImage(uri))
      const uploadedUrls = await Promise.all(uploadPromises)
      
      // Filter out any failed uploads (null values)
      const validUrls = uploadedUrls.filter(url => url !== null) as string[]

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          message: message.trim(),
          image_urls: validUrls // Save the array here
        })

      if (error) throw error

      await supabase
        .from('chats')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', chatId)

      fetchMessages()
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      setError('Network error')
      return false
    }
  }

  return { messages, loading, error, sendMessage, refetch: fetchMessages }
}