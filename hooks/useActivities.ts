import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Activity } from '@/types/database'

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivities()
  }, [])

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('name')

      if (error) {
        console.error('Error fetching activities:', error)
      } else {
        // Sort activities by assumed popularity
        const popularityOrder = [
          'Tennis',
          'Pickleball',
          'Rock Climbing',
          'Hiking/Walking',
          'Running',
          'Cycling',
          'Sailing',
          'Biking',
          'Yoga',
          'Swimming',
          'Basketball',
          'Soccer',
          'Weightlifting',
          'Bar Hopping',
          'Arts and Crafts',
        ];
        
        const sortedActivities = (data || []).sort((a, b) => {
          const indexA = popularityOrder.indexOf(a.name)
          const indexB = popularityOrder.indexOf(b.name)
          
          // If both activities are in the popularity order, sort by that order
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB
          }
          
          // If only one is in the order, prioritize it
          if (indexA !== -1) return -1
          if (indexB !== -1) return 1
          
          // If neither is in the order, sort alphabetically
          return a.name.localeCompare(b.name)
        })
        setActivities(sortedActivities)
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoading(false)
    }
  }

  return { activities, loading, refetch: fetchActivities }
}