import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { calculateDistance, formatDistance, getCurrentLocation } from '@/lib/locationUtils'
import { useActivityStore } from '@/store/useActivityStore';

interface PersonWithSkill {
  id: string
  name: string
  email: string
  avatar_url: string | null
  skill_level: string
  distance: string
  distanceValue: number 
}

export function usePeople() {
  const { user } = useAuth()
  const { activityId } = useActivityStore()
  const [people, setPeople] = useState<PersonWithSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)

  // Effect 1: Get User Location ONCE on mount
  useEffect(() => {
    getCurrentLocation().then((location) => {
      if (location) {
        setUserLocation(location);
      }
    });
  }, []);

  // Effect 2: Fetch People when dependencies change
  useEffect(() => {
    if (activityId) {
      fetchPeople();
    } else {
      setPeople([]);
      setLoading(false);
    }
  }, [activityId, user]);

  const fetchPeople = async () => {
    if (!activityId) {
      setLoading(false)
      return
    }
    
    setLoading(true)

    let currentLoc = userLocation;
    if (!currentLoc) {
      currentLoc = await getCurrentLocation();
      if (currentLoc) setUserLocation(currentLoc);
    }
    
    try {
      // Get list of blocked user IDs (only if user is logged in)
      let blockedUserIds = new Set<string>();
      if (user) {
        const { data: blockedData } = await supabase
          .from('blocked_users')
          .select('blocked_user_id')
          .eq('user_id', user.id);
        
        blockedUserIds = new Set(blockedData?.map(b => b.blocked_user_id) || []);
      }

      const { data, error } = await supabase
        .from('user_activity_skills')
        .select(`
          id,
          user_id,
          activity_id,
          skill_level,
          profiles!user_activity_skills_user_id_fkey (
            id,
            name,
            email,
            avatar_url,
            created_at,
            updated_at,
            latitude,
            longitude,
            location_sharing_enabled
          )
        `)
        .eq('activity_id', activityId)
        .not('profiles', 'is', null)

      if (error) {
        console.log('Clearing people list - error:', error)
        console.error('Error fetching people:', error)
        setPeople([])
      } else if (data) {
        const filteredData = data?.filter(item => {
          const profileData = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          // Filter out self (only if user is logged in) and blocked users
          if (!profileData) return false;
          if (user && item.user_id === user.id) return false;
          if (blockedUserIds.has(item.user_id)) return false;
          return true;
        })
        
        const peopleWithSkills = filteredData?.map(item => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          
          return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatar_url: profile.avatar_url,
            skill_level: item.skill_level,
            distance: calculateDistanceForUser(profile, currentLoc), 
            distanceValue: calculateDistanceValueForUser(profile, currentLoc)
          };
        })
        
        // Sort by distance (closest first)
        peopleWithSkills?.sort((a, b) => {
          return a.distanceValue - b.distanceValue
        })
        
        setPeople(peopleWithSkills)
      } else {
        setPeople([])
      }
    } catch (error) {
      console.error('Unexpected error fetching people:', error)
      setPeople([])
    } finally {
      setLoading(false)
    }
  }

  // Helper to get formatted string
  const calculateDistanceForUser = (profile: any, currentLoc: any): string => {
    if (!profile.location_sharing_enabled) return 'Location private'
    if (!currentLoc || !profile.latitude || !profile.longitude) return '...'
    
    const dist = calculateDistance(currentLoc, { latitude: profile.latitude, longitude: profile.longitude })
    return formatDistance(dist)
  }

  // Helper to get number for sorting
  const calculateDistanceValueForUser = (profile: any, currentLoc: any): number => {
    // If no location, return a huge number so they go to bottom of list
    if (!profile.location_sharing_enabled) return 999999
    if (!currentLoc || !profile.latitude || !profile.longitude) return 999998
    
    return calculateDistance(currentLoc, { latitude: profile.latitude, longitude: profile.longitude })
  }

  return { people, loading, refetch: fetchPeople }
}