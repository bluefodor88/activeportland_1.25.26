import { ActivityCarousel } from '@/components/ActivityCarousel';
import ForumMessageItem from '@/components/ForumMessageItem';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { router } from 'expo-router';
import { getOrCreateChat } from '@/hooks/useChats';
import { useForumMessages } from '@/hooks/useForumMessages';
import { useProfile } from '@/hooks/useProfile';
import { useActivityStore } from '@/store/useActivityStore';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import ImageView from "react-native-image-viewing";
import { SafeAreaView } from 'react-native-safe-area-context';


export default function ForumScreen() {
  const { activityId, activity, skillLevel, emoji } = useActivityStore();

  const { messages, loading, sendMessage } = useForumMessages(activityId);
  const { profile } = useProfile();
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);

  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });

    if (!result.canceled) {
      const uris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...uris]);
    }
  };

  const flatListRef = useRef<FlatList>(null);

  const openGallery = (imageUrls: string[], index: number) => {
    const formattedImages = imageUrls.map(url => ({ uri: url }));
    setGalleryImages(formattedImages);
    setGalleryIndex(index);
    setIsGalleryVisible(true);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedImages.length === 0) return;
    
    if (newMessage.trim().length > 1000) {
      Alert.alert('Message Too Long', 'Please keep messages under 1000 characters');
      return;
    }

    setIsSending(true);

    try {
      const success = await sendMessage(newMessage, replyingTo?.id, selectedImages);
      if (success) {
        setNewMessage('');
        setReplyingTo(null);
        setSelectedImages([]);
      } else {
        Alert.alert('Error', 'Failed to send message.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setIsSending(false);
    }
  };

  const handleLongPress = (message: any) => {
    if (message.user_id === user?.id) return; // Don't allow replying to own messages
    
    setReplyingTo(message);
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const openUserChat = async (message: any) => {
    if (!user || !message.profiles || message.user_id === user.id) return;
    
    try {
      const chatId = await getOrCreateChat(user.id, message.user_id);
      if (chatId) {
        router.push({
          pathname: '/chat/[id]',
          params: { id: message.user_id, name: message.profiles.name }
        });
      }
    } catch (error) {
      console.error('Error opening chat:', error);
    }
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(msg => msg.id === messageId);
  
    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ 
        index, 
        animated: true,
        viewPosition: 0.5 
      });

      // Trigger the Highlight
      setHighlightedMessageId(messageId);
      
      // Clear the ID after animation finishes (approx 2 seconds) so it can be highlighted again later
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);

    } else {
      Alert.alert("Message not found", "The message you are looking for might be too old or deleted.");
    }
  };

  const renderMessage = ({ item }: { item: any }) => (
    <ForumMessageItem
      item={item}
      currentUserId={user?.id}
      profileName={profile?.name}
      messages={messages}
      highlightedId={highlightedMessageId}
      skillLevel={skillLevel}
      onLongPress={handleLongPress}
      onOpenChat={openUserChat}
      onOpenGallery={openGallery}
      onScrollToMessage={scrollToMessage}
    />
  );

  // Only show loading if we have an activity but messages are still loading
  if (loading && activityId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityCarousel />
        <View style={styles.loadingContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ActivityCarousel />
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.headerGradient} />
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Forum</Text>
            <Text style={styles.description} numberOfLines={2}>
              Connect with everyone in your area to share tips and build community
            </Text>
          </View>
        </View>

        {activityId ? (
          <FlatList
            ref={flatListRef}
            inverted
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            onScrollToIndexFailed={(info)=>{
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Select an activity to join the forum</Text>
            <Text style={styles.emptySubtitle}>
              Choose an activity from the Activities tab to start chatting with the community
            </Text>
          </View>
        )}

        {activityId && (
          <>
            {!user && (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginPromptText}>
                  Sign in to join the conversation
                </Text>
                <TouchableOpacity
                  style={styles.loginPromptButton}
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text style={styles.loginPromptButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {user && replyingTo && (
              <View style={styles.replyPreview}>
                <View style={styles.replyPreviewHeader}>
                  <Ionicons name="arrow-undo" size={16} color="#FF8C42" />
                  <Text style={styles.replyPreviewText}>
                    Replying to {replyingTo.profiles?.name || 'Unknown'}
                  </Text>
                  <TouchableOpacity onPress={cancelReply} style={styles.cancelReplyButton}>
                    <Ionicons name="close" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
                {
                  replyingTo.message ? (
                    <Text style={styles.replyPreviewMessage} numberOfLines={2}>
                      {replyingTo.message}
                    </Text>
                  ) : null
                }
              </View>
            )}

            {user && (
              <View style={styles.inputWrapper}>
              {selectedImages.length > 0 && (
                <ScrollView horizontal contentContainerStyle={styles.previewContainer} showsHorizontalScrollIndicator={false}>
                  {selectedImages.map((uri, index) => (
                    <View key={index} style={styles.previewItem}>
                      <Image source={{ uri }} style={styles.previewImage} />
                      <TouchableOpacity 
                        style={styles.removeImageButton} 
                        onPress={() => setSelectedImages(imgs => imgs.filter((_, i) => i !== index))}
                      >
                        <Ionicons name="close-circle" size={20} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={styles.inputContainer}>
                <TouchableOpacity 
                  style={[styles.sendButton, {marginRight: 10}, isSending && {opacity: 0.5}]} 
                  onPress={pickImage} 
                  disabled={isSending}>
                  <Ionicons name="add-circle" size={28} color="white" />
                </TouchableOpacity>
                <TextInput
                  style={styles.textInput}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder={replyingTo ? `Reply to ${replyingTo.profiles?.name || 'Unknown'}...` : "Type your message..."}
                  placeholderTextColor="#999"
                  maxLength={1000}
                  multiline
                  editable={!isSending}
                />
                <TouchableOpacity 
                  style={[
                    styles.sendButton, 
                    (isSending || (!newMessage.trim() && selectedImages.length === 0)) && { opacity: 0.7 }
                  ]} 
                  onPress={handleSendMessage}
                  disabled={isSending || (!newMessage.trim() && selectedImages.length === 0)}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="send" size={20} color="white" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={isGalleryVisible}
        onRequestClose={() => setIsGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    position: 'relative',
    overflow: 'visible',
    zIndex: 1,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FF8C42',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  titleContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
  },
  description: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    lineHeight: 14,
    width: '100%',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 4,
  },
  userSkillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  userSkillLabel: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  userSkillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  userSkillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  messageContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
    transform: [{ scale: 1 }],
  },
  messageAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  messageContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 12
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userName: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginRight: 8,
  },
  clickableUserName: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  skillText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    alignItems: 'flex-end',
  },
  textInput: {
    fontFamily: 'Inter_400Regular',
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  replyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  replyPreview: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C42',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  replyPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  replyPreviewText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    flex: 1,
    marginLeft: 4,
  },
  cancelReplyButton: {
    padding: 4,
  },
  replyPreviewMessage: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontStyle: 'italic',
  },
  attachButton: {
    marginRight: 10,
    justifyContent: 'center',
  },
  inputWrapper: {
    backgroundColor: 'white',
  },
  previewContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewItem: {
    marginRight: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  messageImage: {
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  singleImage: {
    width: 200,
    height: 200,
    resizeMode: 'cover',
  },
  gridImage: {
    width: 80,
    height: 80,
    resizeMode: 'cover',
  },
});