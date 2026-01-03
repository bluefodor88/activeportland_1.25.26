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
          // Suppress refresh token errors when there's no session (expected)
          if (error.message?.includes('Refresh Token') || error.message?.includes('refresh_token')) {
            // This is expected when there's no user - don't log as error
            setUser(null)
          } else {
            console.error('Error getting session:', error)
          }
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error: any) {
        // Suppress refresh token errors
        if (error?.message?.includes('Refresh Token') || error?.message?.includes('refresh_token')) {
          setUser(null)
        } else {
          console.error('Error initializing auth:', error)
          setUser(null)
        }
      } finally {
        setLoading(false)
      }
    }
    
    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        try {
          // Suppress refresh token errors
          if (event === 'TOKEN_REFRESHED' && !session) {
            // Expected when there's no session
            setUser(null)
            setLoading(false)
            return
          }
          setUser(session?.user ?? null)
          setLoading(false)
        } catch (error: any) {
          // Suppress refresh token errors
          if (error?.message?.includes('Refresh Token') || error?.message?.includes('refresh_token')) {
            setUser(null)
          } else {
            console.error('Error handling auth state change:', error)
            setUser(null)
          }
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