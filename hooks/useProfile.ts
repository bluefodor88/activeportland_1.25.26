import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { Profile, UserActivitySkill } from '@/types/database'

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userSkills, setUserSkills] = useState<UserActivitySkill[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchProfile = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Error fetching profile:', error)
      } else if (data) {
        setProfile(data)
      } else {
        setProfile(data)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const fetchUserSkills = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('user_activity_skills')
        .select(`
          id,
          user_id,
          activity_id,
          skill_level,
          created_at,
          updated_at,
          activities (
            name,
            emoji
          )
        `)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error fetching user skills:', error)
        setUserSkills([]) // Set empty array on error to prevent crashes
      } else {
        // console.log('Fetched user skills:', data)
        setUserSkills(data || [])
      }
    } catch (error) {
      console.error('Error fetching user skills:', error)
      setUserSkills([]) // Set empty array on error to prevent crashes
    } finally {
      setLoading(false)
    }
  }, [user])

  // Initial load
  useEffect(() => {
    if (user) {
      fetchProfile()
      fetchUserSkills()
    }
  }, [user, fetchProfile, fetchUserSkills])

  const updateSkillLevel = async (activityId: string, skillLevel: 'Beginner' | 'Intermediate' | 'Advanced', manualUserId?: string) => {
    const targetUserId = manualUserId || user?.id;

    if (!targetUserId) {
      console.log("No user ID found");
      return false;
    }

    console.log('updateSkillLevel called with:', { userId: targetUserId, activityId, skillLevel });

    try {
      // First check if the row exists
      const { data: existing, error: checkError } = await supabase
        .from('user_activity_skills')
        .select('id, skill_level')
        .eq('user_id', targetUserId)
        .eq('activity_id', activityId)
        .maybeSingle()

      const updateData = {
        user_id: targetUserId,
        activity_id: activityId,
        skill_level: skillLevel,
        ready_today: false,
      }

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is fine
        console.error('Error checking existing skill:', checkError)
      }

      let error
      if (existing) {
        // Row exists, update it
        const { error: updateError } = await supabase
          .from('user_activity_skills')
          .update({
            skill_level: skillLevel,
            ready_today: false,
          })
          .eq('user_id', targetUserId)
          .eq('activity_id', activityId)
        error = updateError
      } else {
        // Row doesn't exist, insert it
        const { error: insertError } = await supabase
          .from('user_activity_skills')
          .insert(updateData)
        error = insertError
      }

      if (error) {
        console.error('Error updating skill level:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return false
      } else {
        // Force refresh both profile and skills data
        await Promise.all([fetchProfile(), fetchUserSkills()])
        console.log('Profile and skills refreshed after update');
        return true
      }
    } catch (error) {
      console.error('Error updating skill level:', error)
      return false
    }
  }


  const removeActivity = async (activityId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('user_activity_skills')
        .delete()
        .eq('user_id', user.id)
        .eq('activity_id', activityId)

      if (error) {
        console.error('Error removing activity:', error)
      } else {
        fetchUserSkills() // Refresh skills
      }
    } catch (error) {
      console.error('Error removing activity:', error)
    }
  }

  const uploadProfileImage = async (uri: string) => {
    try {
      setUploading(true);
      if (!user) return { success: false, error: 'No user' };

      // 1. Use standard fetch to get the file data
      const response = await fetch(uri);
      
      // 2. Convert to ArrayBuffer (Supabase accepts this directly)
      const arrayBuffer = await response.arrayBuffer();

      const filePath = `${user.id}/${new Date().getTime()}.png`;
      const contentType = 'image/png';

      // 3. Upload the ArrayBuffer directly
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, { 
          contentType,
          upsert: true 
        });

      if (uploadError) throw uploadError;

      // 4. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 5. Update Profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 6. Refresh
      await fetchProfile();
      
      return { success: true, publicUrl };

    } catch (error: any) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    } finally {
      setUploading(false);
    }
  };

  const refetch = useCallback(() => {
    fetchProfile()
    fetchUserSkills()
  }, [fetchProfile, fetchUserSkills])

  return {
    profile,
    userSkills,
    loading,
    uploading,
    updateSkillLevel,
    removeActivity,
    uploadProfileImage,
    refetch
  }
}