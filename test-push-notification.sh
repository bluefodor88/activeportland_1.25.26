#!/bin/bash

# Test Push Notification Edge Function
# Usage: ./test-push-notification.sh USER_ID "Title" "Body"

# Get these from Supabase Dashboard → Settings → API
SUPABASE_URL="https://krhmxspcxymovgorumqw.supabase.co"
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"  # Replace with your service role key

USER_ID=$1
TITLE=$2
BODY=$3

if [ -z "$USER_ID" ] || [ -z "$TITLE" ] || [ -z "$BODY" ]; then
  echo "Usage: ./test-push-notification.sh USER_ID \"Title\" \"Body\""
  echo "Example: ./test-push-notification.sh abc123 \"Test\" \"Hello world\""
  exit 1
fi

echo "🧪 Testing push notification for user: $USER_ID"
echo "Title: $TITLE"
echo "Body: $BODY"
echo ""

curl -X POST "$SUPABASE_URL/functions/v1/send-push-notification" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"recipientUserId\": \"$USER_ID\",
    \"title\": \"$TITLE\",
    \"body\": \"$BODY\",
    \"data\": {
      \"type\": \"test\"
    }
  }" | jq .

echo ""
echo "✅ Test complete. Check the response above."

