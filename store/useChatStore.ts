import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  unreadCount: number;
  avatar: string;
  otherUserId: string;
}

interface ChatState {
  chats: ChatPreview[];
  loading: boolean;
  initialized: boolean;
  activeChatId: string | null;
  setActiveChat: (chatId: string | null) => void;
  setChats: (chats: ChatPreview[]) => void;
  fetchChats: (userId: string) => Promise<void>;
  markAsRead: (chatId: string, userId: string) => Promise<void>;
  subscribeToChanges: (userId: string) => void;
  unsubscribe: () => void;
}

let subscription: RealtimeChannel | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  loading: false,
  initialized: false,
  activeChatId: null,

  setChats: (chats) => set({ chats }),

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  fetchChats: async (userId) => {
    if (!userId) return;
    if (!get().initialized) set({ loading: true });

    try {
      const { data: chatsData, error } = await supabase
        .from('chats')
        .select('*')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false });

      if (error || !chatsData) throw error;

      const chatPreviews = await Promise.all(
        chatsData.map(async (chat) => {
          const otherUserId = chat.participant_1 === userId ? chat.participant_2 : chat.participant_1;
          const myLastRead = chat.participant_1 === userId ? chat.last_read_p1 : chat.last_read_p2;

          const { data: profile } = await supabase.from('profiles').select('*').eq('id', otherUserId).single();
          
          const { data: lastMsg } = await supabase
            .from('chat_messages')
            .select('message, created_at, image_urls')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const { count } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .neq('sender_id', userId)
            .gt('created_at', myLastRead || '1970-01-01');

          const isActive = get().activeChatId === chat.id;
          const finalUnreadCount = isActive ? 0 : (count || 0);

          return {
            id: chat.id,
            name: profile?.name || 'Unknown',
            lastMessage: lastMsg?.image_urls?.length ? "📷 Photo" : lastMsg?.message ?? "No messages",
            timestamp: new Date(lastMsg?.created_at || chat.created_at),
            unreadCount: finalUnreadCount,
            avatar: profile?.avatar_url ?? null,
            otherUserId
          };
        })
      );

      set({ chats: chatPreviews, loading: false, initialized: true });
    } catch (e) {
      console.log('Error fetching chats:', e);
      set({ loading: false });
    }
  },

  markAsRead: async (chatId, userId) => {
    // 1. Optimistic Update
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    }));

    // 2. Database Update
    const { data: chat } = await supabase.from('chats').select('participant_1').eq('id', chatId).single();
    if (!chat) return;
    const field = chat.participant_1 === userId ? 'last_read_p1' : 'last_read_p2';

    await supabase
      .from('chats')
      .update({ [field]: new Date().toISOString() })
      .eq('id', chatId);
  },

  // NEW: Realtime Subscription
  subscribeToChanges: (userId: string) => {
    if (subscription) return; // Already subscribed

    console.log("🔌 Connecting to Realtime Chat Updates...");
    
    subscription = supabase
      .channel('public:chat_updates')
      // Listen for NEW messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        console.log("🔔 New message received! Refreshing...");
        get().fetchChats(userId);
      })
      // Listen for Read Status updates (when you read it on another device)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => {
        get().fetchChats(userId);
      })
      .subscribe();
  },

  unsubscribe: () => {
    if (subscription) {
      supabase.removeChannel(subscription);
      subscription = null;
    }
  }
}));