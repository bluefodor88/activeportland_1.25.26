import { useAuth } from '@/hooks/useAuth';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScrollView } from 'react-native';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375; // iPhone SE and smaller
const isMediumDevice = width < 414; // iPhone 8 Plus and smaller

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { error } = await signIn(email, password);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps={'handled'}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={{ color: '#FFCF56' }}>The</Text>
          <Text style={{ color: '#FF8C42' }}>Activity</Text>
          <Text style={{ color: '#FFCF56' }}>Hub</Text>
        </Text>
        <View style={styles.logoUnderline} />
        <Text style={styles.location}>Portland, ME</Text>
      </View>

      <View style={styles.form}>
        {/* App Explanation */}
        <Text style={styles.infoText}>
          Stop scrolling. Go play.
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.accountPromptText}>
          Don't have an account?
        </Text>

        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.signUpButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.replace('/(tabs)/forum')}
        >
          <Text style={styles.browseText}>Browse without login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: isSmallDevice ? 32 : isMediumDevice ? 40 : 48,
    fontFamily: 'Inter_800ExtraBold',
    fontStyle: 'italic',
    fontWeight: 'bold',
    textShadowColor: 'rgba(255, 140, 66, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  logoUnderline: {
    width: 60,
    height: 3,
    backgroundColor: '#FF8C42',
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  location: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  form: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#FFCF56',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'center',
    minWidth: 200,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
  },
  accountPromptText: {
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  signUpButton: {
    backgroundColor: '#FF8C42',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'center',
    minWidth: 200,
  },
  signUpButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
  },
  browseButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  browseText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
  },
  infoText: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 24,
  },
});
