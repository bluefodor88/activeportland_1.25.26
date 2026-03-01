import { useState, useEffect, useRef } from 'react'
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
  ready_today: boolean
  distance: string
  distanceValue: number 
}

export function usePeople() {
  const { user } = useAuth()
  const { activityId } = useActivityStore()
  const [people, setPeople] = useState<PersonWithSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const hadLocationRef = useRef(false)

  // Effect 1: Get location once on mount (like main). Non-blocking with timeout so list loads fast.
  useEffect(() => {
    const timeoutMs = 8000;
    Promise.race([
      getCurrentLocation(),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]).then((location) => {
      if (location) setUserLocation(location);
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

  // Effect 3: When location first becomes available, re-fetch so distances and sort update
  useEffect(() => {
    if (userLocation && activityId) {
      if (!hadLocationRef.current) {
        hadLocationRef.current = true;
        fetchPeople();
      }
    } else if (!userLocation) {
      hadLocationRef.current = false;
    }
  }, [userLocation, activityId]);

  const fetchPeople = async (options?: { tryLocation?: boolean }) => {
    if (!activityId) {
      setLoading(false)
      return
    }
    
    setLoading(true)

    // If refetch with tryLocation (e.g. after pull-to-refresh), try to get location so we pick it up after user grants permission
    let currentLoc = userLocation
    if (options?.tryLocation && !currentLoc) {
      currentLoc = await Promise.race([
        getCurrentLocation(),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ])
      if (currentLoc) setUserLocation(currentLoc)
    }

    const fetchData = async () => {
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
          ready_today,
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
        .not('profiles', 'is', null);
      return { data, error, blockedUserIds };
    };

    const { data, error, blockedUserIds } = await fetchData();

    try {
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
            ready_today: item.ready_today || false,
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
    if (!profile.latitude || !profile.longitude) return '—'
    if (!currentLoc) return ''
    
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