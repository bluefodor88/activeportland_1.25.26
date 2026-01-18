import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

interface PushNotificationPayload {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: any;
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    const requestBody = await req.json();
    console.log("📥 Received request:", JSON.stringify(requestBody, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let recipientUserId: string;
    let title: string;
    let body: string;
    let data: any;

    // Check if this is a webhook payload (from database trigger) or direct API call
    if (requestBody.type === "INSERT" && requestBody.table === "chat_messages" && requestBody.record) {
      // This is a webhook payload from Supabase
      console.log("🔔 Processing webhook payload for new message");
      const messageRecord = requestBody.record;
      const senderId = messageRecord.sender_id;
      const chatId = messageRecord.chat_id;
      const messageText = messageRecord.message || "📷 Photo";

      // Get the chat to find the recipient
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("participant_1, participant_2")
        .eq("id", chatId)
        .single();

      if (chatError || !chat) {
        console.error("❌ Error fetching chat:", chatError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch chat information" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Determine recipient (the person who didn't send the message)
      recipientUserId = chat.participant_1 === senderId ? chat.participant_2 : chat.participant_1;

      // Get sender's name
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", senderId)
        .single();

      const senderName = senderProfile?.name || "Someone";

      // Format notification
      title = `New message from ${senderName}`;
      body = messageText.length > 100 ? messageText.substring(0, 100) + "..." : messageText;
      data = {
        type: "new_message",
        chatId: chatId,
        otherUserId: senderId,
        userName: senderName,
      };

      console.log(`✅ Processed webhook: recipient=${recipientUserId}, sender=${senderName}`);
    } else {
      // This is a direct API call (for testing)
      console.log("📞 Processing direct API call");
      ({ recipientUserId, title, body, data } = requestBody);

      if (!recipientUserId || !title || !body) {
        console.error("❌ Missing required fields:", { recipientUserId, title, body });
        return new Response(
          JSON.stringify({ error: "Missing required fields: recipientUserId, title, body" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
    
    console.log("✅ Request validated, looking up push tokens for user:", recipientUserId);

    // Get recipient's push tokens
    const { data: pushTokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", recipientUserId);

    if (tokensError) {
      console.error("Error fetching push tokens:", tokensError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch push tokens" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.warn(`⚠️ No push tokens found for user ${recipientUserId}`);
      return new Response(
        JSON.stringify({ 
          message: "No push tokens found for user", 
          sent: 0,
          userId: recipientUserId 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    console.log(`✅ Found ${pushTokens.length} push token(s) for user ${recipientUserId}`);

    // Prepare notifications for all tokens (user might have multiple devices)
    const notifications: PushNotificationPayload[] = pushTokens.map((token) => ({
      to: token.expo_push_token,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    // Send to Expo Push Notification API
    console.log(`📤 Sending ${notifications.length} notification(s) to Expo API...`);
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(notifications),
    });

    const result = await response.json();
    console.log("📥 Expo API response:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("Expo API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send push notification", details: result }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Expo returns an array of results, one per notification
    const successCount = Array.isArray(result.data)
      ? result.data.filter((r: any) => r.status === "ok").length
      : 0;

    return new Response(
      JSON.stringify({
        message: "Push notifications sent",
        sent: successCount,
        total: notifications.length,
        results: result,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in send-push-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

