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

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: jobs, error: jobsError } = await supabase
      .from("meetup_notification_jobs")
      .select("id, invite_id, recipient_id, sender_id, job_type, run_at, event_start_at")
      .eq("status", "pending")
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(100);

    if (jobsError) {
      console.error("Error fetching meetup notification jobs:", jobsError);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No jobs due" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const job of jobs) {
      const jobId = job.id;

      if (job.event_start_at && new Date(job.event_start_at).getTime() <= now.getTime()) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: invite, error: inviteError } = await supabase
        .from("meetup_invites")
        .select("id, sender_id, recipient_id, location, event_date, event_time, status")
        .eq("id", job.invite_id)
        .single();

      if (inviteError || !invite) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      if (job.job_type === "invite_reminder" && invite.status !== "pending") {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      if (job.job_type !== "invite_reminder" && invite.status !== "accepted") {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", invite.sender_id)
        .single();

      const senderName = senderProfile?.name || "someone";

      let title = "";
      let body = "";
      let data: any = {};

      if (job.job_type === "invite_reminder") {
        title = "Quick check!";
        body = `${senderName} waiting to hear from you. ${invite.location} in 3 hours.`;
        data = { type: "invite_reminder", inviteId: invite.id };
      } else if (job.job_type === "accepted_reminder_3h") {
        title = "Plan set!";
        body = `${invite.location} in 3 hours. Lets go.`;
        data = { type: "event_reminder", meetingId: invite.id };
      } else {
        title = "Lets roll";
        body = `${invite.location}. 5 minutes.`;
        data = { type: "event_reminder", meetingId: invite.id };
      }

      const { data: pushTokens, error: tokensError } = await supabase
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", invite.recipient_id);

      if (tokensError || !pushTokens || pushTokens.length === 0) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "skipped", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const notifications: PushNotificationPayload[] = pushTokens.map((token) => ({
        to: token.expo_push_token,
        sound: "default",
        title,
        body,
        data,
      }));

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
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "error", updated_at: nowIso })
          .eq("id", jobId);
        console.error("Expo push error:", result);
        continue;
      }

      await supabase
        .from("meetup_notification_jobs")
        .update({ status: "sent", updated_at: nowIso })
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ message: "Processed jobs", count: jobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in process-meetup-notifications:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
