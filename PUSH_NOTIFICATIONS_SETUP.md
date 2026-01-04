# Push Notifications Setup Guide

This guide will help you set up push notifications for your app so messages work even when the app is closed.

## Prerequisites

- Supabase account (you already have this)
- Expo account (you already have this)
- Supabase CLI installed (for deploying Edge Functions)

## Step 1: Run Database Migrations

Run the migration files in your Supabase dashboard:

1. Go to Supabase Dashboard > SQL Editor
2. Run `supabase/migrations/20260103000000_add_push_tokens.sql`
3. Run `supabase/migrations/20260103000001_add_push_notification_trigger.sql`

Or use Supabase CLI:
```bash
supabase db push
```

## Step 2: Deploy Edge Function

1. Install Supabase CLI if you haven't:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the function:
   ```bash
   supabase functions deploy send-push-notification
   ```

## Step 3: Set Up Database Webhook

1. Go to Supabase Dashboard > Database > Webhooks
2. Click "Create a new webhook"
3. Configure:
   - **Name**: Send Push Notification
   - **Table**: `chat_messages`
   - **Events**: INSERT
   - **HTTP Request**
     - **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification`
     - **Method**: POST
     - **Headers**:
       ```
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       Content-Type: application/json
       ```
     - **Request Body** (Advanced):
       ```json
       {
         "recipientUserId": "{{(SELECT CASE WHEN participant_1 = new.sender_id THEN participant_2 ELSE participant_1 END FROM chats WHERE id = new.chat_id)}}",
         "title": "New message from {{(SELECT name FROM profiles WHERE id = new.sender_id)}}",
         "body": "{{new.message || '📷 Photo'}}",
         "data": {
           "type": "new_message",
           "chatId": "{{new.chat_id}}",
           "otherUserId": "{{new.sender_id}}"
         }
       }
       ```

**Note**: The webhook body syntax above is simplified. You may need to use Supabase's webhook transformation feature or create a simpler webhook that calls a database function.

## Step 4: Alternative - Use pg_net Extension

If your Supabase project has the `pg_net` extension enabled, you can use the trigger-based approach instead of webhooks.

1. Enable pg_net extension in Supabase Dashboard > Database > Extensions
2. The trigger in the migration will automatically work

## Step 5: Test

1. Build and install the app on a device
2. Log in with two different accounts
3. Send a message from one account to the other
4. Close the receiving app completely
5. The message should trigger a push notification

## Troubleshooting

### Push tokens not being stored
- Check that the `push_tokens` table was created
- Check app logs for errors when registering tokens
- Verify user is logged in when token is registered

### Notifications not being sent
- Check Edge Function logs in Supabase Dashboard
- Verify webhook is configured correctly
- Check that push tokens exist for the recipient user
- Verify Expo Push Token is valid

### Edge Function deployment fails
- Make sure you're logged in: `supabase login`
- Verify project is linked: `supabase projects list`
- Check that you have the correct permissions

## How It Works

1. **User logs in** → App gets Expo push token → Stores in `push_tokens` table
2. **User sends message** → Message inserted into `chat_messages` table
3. **Database trigger/webhook fires** → Calls Edge Function
4. **Edge Function** → Looks up recipient's push tokens → Sends to Expo API
5. **Expo** → Delivers notification to device (even if app is closed)

## Cost

- **Supabase Edge Functions**: Free tier includes 500,000 invocations/month
- **Expo Push Notifications**: Free, unlimited
- **Total**: $0 for most apps

