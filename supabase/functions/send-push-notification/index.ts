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

    const { recipientUserId, title, body, data } = await req.json();

    if (!recipientUserId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipientUserId, title, body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      console.log(`No push tokens found for user ${recipientUserId}`);
      return new Response(
        JSON.stringify({ message: "No push tokens found for user", sent: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Prepare notifications for all tokens (user might have multiple devices)
    const notifications: PushNotificationPayload[] = pushTokens.map((token) => ({
      to: token.expo_push_token,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    // Send to Expo Push Notification API
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

