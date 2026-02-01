import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { ForumMessage } from '@/types/database'
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker'

export function useForumMessages(activityId?: string) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ForumMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activityId) {
      // 1. Load initial messages
      fetchMessages(true) 
      
      // 2. Set up real-time listener
      const subscription = supabase
        .channel(`forum_messages_${activityId}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'forum_messages',
            filter: `activity_id=eq.${activityId}`
          }, 
          () => fetchMessages(false)
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscription)
      }
    }
  }, [activityId])

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

  const fetchMessages = async (showLoading = false) => {
    if (!activityId) return

    if (showLoading) setLoading(true)
      
    try {
      const { data, error } = await supabase
        .from('forum_messages')
        .select(`
          *,
          reply_to:forum_messages!reply_to_id (
            id,
            message,
            image_urls,
            profiles!user_id (
              name
            )
          ),
          profiles (
            name,
            avatar_url,
            user_activity_skills (
              skill_level,
              activity_id
            )
          ),
          activities (
            name,
            emoji
          )
        `)
        .eq('activity_id', activityId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching forum messages:', error)
        setMessages([])
      } else {
        console.log(`Fetched ${data?.length || 0} forum messages for activity ${activityId}`)
      setMessages(data || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      setMessages([])
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  // Helper: Upload Image
  const uploadImage = async (uri: string) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    
    try {
      const response = await fetch(uri)
      const arrayBuffer = await response.arrayBuffer()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
      
      const { error } = await supabase.storage
        .from('chat-images') // Reusing your existing bucket
        .upload(fileName, arrayBuffer, { contentType: 'image/png' })

      if (error) throw error
      
      const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName)
      return data.publicUrl
    } catch (error) {
      console.error('Upload failed:', error)
      return null
    }
  }

  // Updated sendMessage to accept images
  const sendMessage = async (message: string, replyToId?: string, imageUris: string[] = []) => {
    if (!activityId || !user) return false
    if (!message.trim() && imageUris.length === 0) return false

    if (message.trim().length > 1000) {
      Alert.alert('Message too long')
      return false
    }

    try {
      // 1. Upload Images
      const uploadPromises = imageUris.map(uri => uploadImage(uri))
      const uploadedUrls = await Promise.all(uploadPromises)
      const validUrls = uploadedUrls.filter(url => url !== null) as string[]

      // 2. Insert Message
      const { error } = await supabase
        .from('forum_messages')
        .insert({
          activity_id: activityId,
          user_id: user.id,
          message: message.trim(),
          reply_to_id: replyToId || null,
          image_urls: validUrls
        })

      if (error) throw error

      fetchMessages(false) 
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }

  return { messages, loading, sendMessage, refetch: () => fetchMessages(false) }
}