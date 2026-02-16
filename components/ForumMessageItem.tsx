import React, { useEffect, useRef } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  interpolateColor,
} from 'react-native-reanimated';
import RepliedToMessage from './RepliedToMessage';
import { ICONS } from '@/lib/helperUtils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ForumMessageItem = React.memo(
  ({
    item,
    currentUserId,
    profileName,
    messages,
    highlightedId,
    skillLevel,
    onLongPress,
    onOpenChat,
    onOpenGallery,
    onScrollToMessage,
  }: any) => {
    const isMe =
      item.profiles?.name?.toLowerCase() === profileName?.toLowerCase();
    const userName = isMe ? 'You' : item.profiles?.name || 'Unknown';
    const avatarUrl = item.profiles?.avatar_url ?? null;
    const hasImages = item.image_urls && item.image_urls.length > 0;

    // 1. Shared Value for animation (0 = normal, 1 = highlighted)
    const highlightProgress = useSharedValue(0);

    // 2. Trigger Animation when ID matches
    useEffect(() => {
      if (highlightedId === item.id) {
        // Sequence: Fade In -> Wait -> Fade Out
        highlightProgress.value = withSequence(
          withTiming(1, { duration: 300 }),
          withDelay(1000, withTiming(0, { duration: 500 }))
        );
      }
    }, [highlightedId, item.id]);

    // 3. Animated Style (Interpolate Color)
    const animatedStyle = useAnimatedStyle(() => {
      const backgroundColor = interpolateColor(
        highlightProgress.value,
        [0, 1],
        ['white', '#FFE0B2'] // White -> Light Orange
      );
      return { backgroundColor };
    });

    const getUserSkillLevel = () => {
      if (isMe) return skillLevel;
      return (
        item.profiles?.user_activity_skills?.[0]?.skill_level ?? 'Intermediate'
      );
    };

    const getSkillColor = (level: string) => {
      switch (level) {
        case 'Beginner':
          return '#4CAF50';
        case 'Intermediate':
          return '#FFBF00';
        case 'Advanced':
          return '#FF9800';
        default:
          return '#999';
      }
    };

    const renderMessageText = (text: string) => {
      if (!text) return null;
      const parts = text.split(/(https?:\/\/[^\s]+)/g);
      return parts.map((part, index) => {
        if (/(https?:\/\/[^\s]+)/g.test(part)) {
          return (
            <Text
              key={index}
              style={{ textDecorationLine: 'underline', color: '#0000EE' }}
              onPress={() => Linking.openURL(part)}
            >
              {part}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      });
    };

    const userSkillLevel = getUserSkillLevel();
    const replyToMessage = item.reply_to_id
      ? messages.find((msg: any) => msg.id === item.reply_to_id)
      : null;

    return (
      <AnimatedPressable
        style={[styles.messageContainer, { gap: 12 }, animatedStyle]} // Apply animated style here
        onLongPress={() => onLongPress(item)}
        delayLongPress={500}
      >
        <View style={styles.messageContent}>
          <TouchableOpacity
            onPress={() => {
              if (item.user_id && item.user_id !== currentUserId) {
                router.push({
                  pathname: '/(tabs)/people/[id]',
                  params: { id: item.user_id, name: item.profiles?.name, from: 'forum' },
                });
              }
            }}
            disabled={!item.user_id || item.user_id === currentUserId}
          >
            <Image
              source={avatarUrl ? { uri: avatarUrl } : ICONS.profileIcon}
              style={styles.messageAvatar}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.messageHeader}>
              <TouchableOpacity onPress={() => onOpenChat(item)}>
                <Text
                  style={[styles.userName, !isMe && styles.clickableUserName]}
                >
                  {userName}
                </Text>
              </TouchableOpacity>
              <View
                style={[
                  styles.skillBadge,
                  { backgroundColor: getSkillColor(userSkillLevel) },
                ]}
              >
                <Text style={styles.skillText}>{userSkillLevel}</Text>
              </View>
            </View>
            {item.message ? (
              <Text style={styles.messageText}>
                {renderMessageText(item.message)}
              </Text>
            ) : null}

            {hasImages && (
              <View style={styles.imageGrid}>
                {item.image_urls.map((url: string, index: number) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => onOpenGallery(item.image_urls, index)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: url }}
                      style={[
                        styles.messageImage,
                        item.image_urls.length > 1
                          ? styles.gridImage
                          : styles.singleImage,
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {replyToMessage && (
          <RepliedToMessage
            replyToId={item.reply_to_id}
            replyToMessage={replyToMessage}
            messageItem={item}
            scrollToMessage={onScrollToMessage}
          />
        )}
      </AnimatedPressable>
    );
  }
);

export default ForumMessageItem;

const styles = StyleSheet.create({
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
    gap: 12,
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
