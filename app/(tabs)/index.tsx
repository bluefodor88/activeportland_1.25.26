import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useProfile } from '@/hooks/useProfile';

export default function ActivitiesScreen() {
  const { userSkills } = useProfile();

  // Redirect to profile if user has activities, or to forum if they don't
  useFocusEffect(
    useCallback(() => {
      if (userSkills.length > 0) {
        // User has activities, redirect to forum
        router.replace('/(tabs)/forum');
      } else {
        // No activities, redirect to profile to add one
        router.replace('/(tabs)/profile');
      }
    }, [userSkills.length])
  );

  // Show loading state while redirecting
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.text}>Redirecting...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
});
