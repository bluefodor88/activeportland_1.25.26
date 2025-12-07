import { useAuth } from '@/hooks/useAuth'
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, loading } = useAuth()

  if (loading) {
    return null // Or a loading screen
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}