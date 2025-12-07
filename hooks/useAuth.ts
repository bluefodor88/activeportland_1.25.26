import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session with error handling
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Error getting session:', error)
        }
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error initializing auth:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    
    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        try {
          setUser(session?.user ?? null)
          setLoading(false)
        } catch (error) {
          console.error('Error handling auth state change:', error)
          setUser(null)
          setLoading(false)
        }
      }
    )

    return () => {
      try {
        subscription.unsubscribe()
      } catch (error) {
        console.error('Error unsubscribing from auth changes:', error)
      }
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!email?.trim() || !password?.trim()) {
      return { data: null, error: { message: 'Email and password are required' } }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password,
    })
    return { data, error }
  }

  const signUp = async (email: string, password: string, name: string) => {
    if (!email?.trim() || !password?.trim() || !name?.trim()) {
      return { data: null, error: { message: 'All fields are required' } }
    }

    if (password.length < 6) {
      return { data: null, error: { message: 'Password must be at least 6 characters' } }
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (data.user && !error) {
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
        })
      
      if (profileError) {
        console.error('Error creating profile:', profileError)
        return { data, error: { message: 'Account created but profile setup failed' } }
      }
    }

    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  }
}