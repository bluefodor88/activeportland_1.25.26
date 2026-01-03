import { useAuth } from '@/hooks/useAuth'
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, loading } = useAuth()

  if (loading) {
    return null // Or a loading screen
  }

  // If user is logged in, go to tabs; otherwise go to login
  if (user) {
    return <Redirect href="/(tabs)/forum" />;
  }

  // Redirect to login screen
  return <Redirect href="/(auth)/login" />;
}