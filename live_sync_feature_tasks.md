# Live Call Transcription Implementation Guide

## Overview
This document outlines the steps to implement real-time call transcription display in the Twilio Owl Loan AI Demo application. The feature will capture transcripts from an outbound call and display them live in the UI as the conversation happens.

## System Architecture
The live transcription feature consists of several components working together:

1. **Twilio Voice Intelligence** - Provides real-time transcription of phone calls
2. **Twilio Sync** - Streams transcription data in real-time between backend and frontend 
3. **Serverless Function** - Processes transcription events from Twilio and forwards them to Sync
4. **React Frontend** - Subscribes to Sync streams and displays transcriptions in the UI

## Implementation Steps

### 1. Backend Configuration (Serverless Functions)

#### 1.1 Ensure Voice Intelligence is configured in the outbound call TwiML
In `serverless-functions/src/functions/voice/make-outbound-call.ts`, ensure the TwiML includes transcription:

```typescript
createCallPayload["twiml"] += `<Start>`;
// -- Start: Check For Vintel Supported Languages
if (selectedConfig.voiceIntelligenceSid) {
  createCallPayload["twiml"] += `<Transcription intelligenceService="${
    selectedConfig.voiceIntelligenceSid
  }" statusCallbackUrl="https://${
    context.DOMAIN_NAME
  }/voice/real-time-transcription" languageCode="${
    selectedConfig.realtimeTranscriptionLanguage ?? "en-US"
  }" speechModel="${selectedConfig.realtimeTranscriptionModel}"/>`;
} else {
  createCallPayload[
    "twiml"
  ] += `<Transcription statusCallbackUrl="https://${
    context.DOMAIN_NAME
  }/voice/real-time-transcription" languageCode="${
    selectedConfig.realtimeTranscriptionLanguage ?? "en-US"
  }" speechModel="${selectedConfig.realtimeTranscriptionModel}" />`;
}
createCallPayload["twiml"] += `</Start>`;
```

#### 1.2 Verify Real-Time Transcription Function
Ensure the `real-time-transcription.ts` function handles transcription events correctly:

```typescript
// In serverless-functions/src/functions/voice/real-time-transcription.ts
if (event.TranscriptionEvent === "transcription-content") {
  const client = context.getTwilioClient();
  const transcriptionData = JSON.parse(event.TranscriptionData);
  console.log(
    `[real-time-transciption] Raw Transcription Data`,
    transcriptionData
  );
  const transcript = transcriptionData.transcript;
  console.log(
    `[real-time-transciption] ${event.CallSid} | ${event.Track} | ${transcript}`
  );
  await client.sync.v1
    .services(context.TWILIO_SYNC_SERVICE_SID)
    .syncStreams(`STREAM-${event.CallSid}`)
    .streamMessages.create({
      data: {
        transcription: transcript,
        track: event.Track,
      },
    });
}
```

#### 1.3 Set up Sync Stream Creation
When a call is initiated, ensure a Sync Stream is created for the call. In `make-outbound-call.ts`:

```typescript
// Ensure a Sync Stream is created for the call
try {
  await client.sync.v1
    .services(context.TWILIO_SYNC_SERVICE_SID)
    .syncStreams
    .create({
      uniqueName: `STREAM-${result.sid}`,
      ttl: 60 * 60 * 3, // 3 hours
    });
} catch (err) {
  console.log("Twilio Sync Stream already exists or error creating it:", err);
}
```

### 2. Frontend Implementation (React Client UI)

#### 2.1 Set up Sync Client and Token Authentication
In the `DemoOutboundCallDetails` component, implement Sync client setup:

```typescript
// In client-ui/src/components/DemoOutboundCallDetails/index.tsx

// Get Sync Token
const setupSyncClient = async () => {
  try {
    const result = await fetch(`/sync/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identity: props.user.phone,
      }),
    });
    const resultJson = await result.json();
    const token = await resultJson.token;
    
    // Setup Client
    let client = new SyncClient(token);
    if (!client) {
      console.warn(`Twilio Client unavailable`);
      return;
    }
    setIsLoadingSyncClient(false);
    
    // Connect to Stream
    client
      .stream({
        id: `STREAM-${props.callSid}`,
        mode: "open_or_create",
        ttl: 60 * 60 * 3,
      })
      .then((stream) => {
        stream.on("messagePublished", (data) => {
          // Handle incoming transcription
        });
      });
  } catch (err) {
    console.log("Error in Fetching Sync Token", err);
  }
}
```

#### 2.2 Render Transcriptions in the UI
Implement the message handling and UI rendering:

```typescript
stream.on("messagePublished", (data) => {
  console.log(`New stream STREAM-${props.callSid} data`, data);
  const track = (data.message.data as any).track.replace(
    "_track",
    ""
  );
  const reverseTrack = track === "inbound" ? "outbound" : "inbound";
  const transcript = (data.message.data as any).transcription;
  
  if (reverseTrack === "inbound") {
    push({
      variant: reverseTrack,
      content: (
        <ChatMessage variant={reverseTrack}>
          <ChatBubble>{transcript}</ChatBubble>
          <ChatMessageMeta aria-label="said by AI Assistant">
            <ChatMessageMetaItem>
              <Avatar
                name="AI Assistant"
                size="sizeIcon20"
                icon={ProductAIAssistantsIcon}
              />
              Twilio AI Assistant
            </ChatMessageMetaItem>
          </ChatMessageMeta>
        </ChatMessage>
      ),
    });
  } else {
    push({
      variant: reverseTrack,
      content: (
        <ChatMessage variant={reverseTrack}>
          <ChatBubble>{transcript}</ChatBubble>
          <ChatMessageMeta aria-label="said by user">
            <ChatMessageMetaItem>
              <Avatar name={props.user.name} size="sizeIcon20" />
              {props.user.name}
            </ChatMessageMetaItem>
          </ChatMessageMeta>
        </ChatMessage>
      ),
    });
  }
  
  // Auto-scroll to the latest message
  scrollToChatEnd();
});
```

#### 2.3 Create Chat Logger UI Component
Ensure the ChatLogger component is used to display the conversation:

```tsx
<Card padding="space30">
  <Box
    display="flex"
    flexDirection="column"
    rowGap="space50"
    alignItems="center"
    element="INSIDE_OF_WHITE_CARD"
  >
    <Box
      display="flex"
      width="100%"
      columnGap="space40"
      element="TOP_ROW"
    >
      <Avatar
        variant="entity"
        icon={ProductVoiceIntelligenceIcon}
        size="sizeIcon20"
        name="entity-avatar"
      />
      <Box
        display="flex"
        justifyContent="space-between"
        width="size30"
        element="TWO_TEXTS"
      >
        <Paragraph marginBottom="space0">
          Real-time Transcription
          <DetailText>Powered by Twilio Voice Intelligence</DetailText>
        </Paragraph>
      </Box>
    </Box>
    <Box width="100%" element="SEPARATOR">
      <Separator orientation="horizontal" verticalSpacing="space0" />
    </Box>
    <Box width="100%" padding="space0">
      <ChatLogger chats={chats} />
      <Box ref={loggerRef}></Box>
    </Box>
  </Box>
</Card>
```

### 3. Environment Configuration and Testing

#### 3.1 Set Required Environment Variables
Ensure these variables are set in your serverless `.env` file:

```
# Twilio Settings
TWILIO_INTELLIGENCE_SERVICE_SID=GAxxxx    # Voice Intelligence Service SID
TWILIO_SYNC_SERVICE_SID=ISxxxx            # Sync Service SID
TWILIO_API_KEY=SKxxxx                     # API Key for Sync authentication
TWILIO_API_SECRET=bxxxx                   # API Secret for Sync authentication
```

#### 3.2 Configure Language Options
Ensure language settings include Voice Intelligence SIDs in `language.helper.private.ts`:

```typescript
// Example for English US
"en-US": {
  voiceIntelligenceSid: "GA2e234b8616aa531ff182af08f7f8ce25",
  realtimeTranscriptionLanguage: "en-US",
  realtimeTranscriptionModel: "telephony",
  transcriptionProvider: "deepgram",
  // other settings...
}
```

### 4. Deployment and Testing

1. Build the client UI:
   ```
   cd client-ui
   npm run build
   ```

2. Deploy the serverless functions:
   ```
   cd serverless-functions
   twilio serverless deploy
   ```

3. Test the functionality:
   - Make an outbound call through the UI
   - Verify that transcriptions appear in real-time
   - Check both sides of the conversation are displayed
   - Verify auto-scrolling works as new messages arrive

### 5. Troubleshooting

#### Common Issues:

1. **Missing transcriptions:**
   - Check Voice Intelligence service is correctly configured
   - Verify the statusCallbackUrl in the TwiML is correct
   - Check logs for any errors in the real-time-transcription function

2. **Sync connectivity issues:**
   - Verify Sync token generation works properly
   - Check browser console for Sync client errors
   - Ensure the correct Stream name format is used: `STREAM-{callSid}`

3. **Transcriptions appear but with wrong speaker:**
   - Check the track identification logic in the messagePublished handler
   - Verify the inbound/outbound track mapping

4. **UI rendering issues:**
   - Check ChatLogger implementation
   - Verify Twilio Paste components are imported correctly
   - Test auto-scrolling functionality

## Conclusion

The live transcription feature leverages Twilio Voice Intelligence to capture real-time transcriptions and Twilio Sync to stream this data to the frontend. The frontend subscribes to these updates and renders them in a chat-like interface, providing users with a real-time view of the conversation.

This implementation provides a seamless user experience, allowing users to follow the conversation between the customer and the AI Assistant as it happens.
