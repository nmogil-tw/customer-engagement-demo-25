/**
 * @param {import('@twilio-labs/serverless-runtime-types/types').Context} context
 * @param {{}} event
 * @param {import('@twilio-labs/serverless-runtime-types/types').ServerlessCallback} callback
 */
exports.handler = async function(context, event, callback) {
    const client = context.getTwilioClient();
    const sessionId = event.request.headers['x-session-id'];
    const identityHeader = event.request.headers['x-identity'];
    const {
        conversation_summary,
        next_steps,
        customer_name,
        customer_email,
        last_order_summary,
        interactionSid, // From the example event
        summary, // From the example event
        channelType // From the example event
    } = event;

    // Log incoming event data for debugging
    console.log("Processing request for sessionId: " + sessionId);
    console.log("Identity header: " + identityHeader);
    console.log("Event data: " + JSON.stringify(event, null, 2).substring(0, 500));

    // Call aia-conversation-ended before proceeding
    try {
        console.log("Calling aia-conversation-ended function...");
        
        // Prepare the payload for aia-conversation-ended function
        // It requires interactionSid, summary, and optionally channelType
        const aiaPayload = {
            interactionSid: interactionSid || event.interactionSid, 
            summary: summary || conversation_summary || "Conversation transferred to human agent",
            channelType: channelType || "SMS"
        };
        
        // Include the necessary headers
        const headers = {
            'x-identity': identityHeader,
            'x-session-id': sessionId,
            'Content-Type': 'application/json'
        };
        
        // Make the HTTP request to the aia-conversation-ended function
        const axios = require('axios');
        const aiaResponse = await axios.post(
            'https://ai-assistant-retail-owl-shoes-v2-7224-dev.twil.io/tools/interactions-v3/aia-conversation-ended',
            aiaPayload,
            { headers }
        );
        
        console.log("aia-conversation-ended response status: " + aiaResponse.status);
        console.log("aia-conversation-ended response: " + JSON.stringify(aiaResponse.data).substring(0, 500));
    } catch (error) {
        // Log error but continue with the function
        console.error("Error calling aia-conversation-ended:", error.message);
        if (error.response) {
            console.error("Response data:", JSON.stringify(error.response.data).substring(0, 500));
            console.error("Response status:", error.response.status);
        }
        // We don't return here, we continue with the transfer logic
    }

    // Voice call handling
    if (sessionId && sessionId.startsWith('voice:')) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const twilioAccountSid = context.ACCOUNT_SID;
        const flexVoiceStudioFlow = context.TWILIO_FLEX_VOICE_STUDIO_FLOW;
        const [callSid] = sessionId.replace('voice:', '').split('/')
        const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
        const syncDocumentName = callSid + '_conversation_summary';
        console.log(syncDocumentName);

        // Save all relevant properties to Sync
        if (conversation_summary || next_steps || customer_name || customer_email || last_order_summary || summary) {
            const syncData = {
                conversation_summary: conversation_summary || summary,
                next_steps,
                customer_name,
                customer_email,
                last_order_summary
            };

            try {
                await client.sync.services(syncServiceSid)
                    .documents(syncDocumentName)
                    .update({
                        data: syncData
                    });
            } catch (error) {
                if (error.code === 20404) {
                    try {
                        await client.sync.services(syncServiceSid)
                            .documents
                            .create({
                                uniqueName: syncDocumentName,
                                data: syncData
                            });
                        console.log("created doc " + syncDocumentName);
                    } catch (createError) {
                        console.error("Failed to create Sync document:", createError);
                        // Continue execution even if Sync fails
                    }
                } else {
                    console.error("Failed to update Sync document:", error);
                    // Continue execution even if Sync fails
                }
            }
        }

        try {
            await client.calls(callSid).update({
                twiml: `<Response><Say>One second while we connect you</Say><Redirect>https://webhooks.twilio.com/v1/Accounts/${twilioAccountSid}/Flows/${flexVoiceStudioFlow}?FlowEvent=return</Redirect></Response>`
            });
            return callback(null, 'Call forwarded');
        } catch (error) {
            console.error("Failed to update call:", error);
            return callback(error);
        }
    }

    // Non-voice call handling (chat, SMS, WhatsApp)
    const FLEX_WORKFLOW_SID = event.FlexWorkflowSid || context.FLEX_WORKFLOW_SID;
    const FLEX_WORKSPACE_SID = event.FlexWorkspaceSid || context.FLEX_WORKSPACE_SID;

    if (!FLEX_WORKFLOW_SID || !FLEX_WORKSPACE_SID) {
        return callback(
            new Error(
                "Missing configuration for FLEX_WORKSPACE_SID OR FLEX_WORKFLOW_SID"
            )
        );
    }
    
    console.log("Session ID from headers: " + event.request.headers["x-session-id"]);
    
    // Parse the session ID to extract conversation details
    const [serviceSid, conversationsSid] = event.request.headers["x-session-id"]
        ?.replace("conversations__", "")
        .split("/");
    
    // Parse the identity header
    const [traitName, identity] = event.request.headers["x-identity"]?.split(":");

    if (!identity || !conversationsSid) {
        return callback(new Error("Invalid request - missing identity or conversationsSid"));
    }

    try {
        let from = identity || event.request.headers["user_id"];
        let customerName = from;
        let customerAddress = from;
        let channelType = "chat"; // Set default channel type to chat

        if (traitName === "whatsapp") {
            channelType = "whatsapp";
            from = `whatsapp:${identity}`;
            customerName = from;
            customerAddress = from;
        } else if (identity && identity.startsWith("+")) {
            channelType = "sms";
            customerName = from;
            customerAddress = from;
        } else if (identity && identity.startsWith("FX")) {
            // Flex webchat
            channelType = "web";
            customerName = from;
            customerAddress = from;
            try {
                const user = await client.conversations.users(identity).fetch();
                from = user.friendlyName;
            } catch (err) {
                console.error("Error fetching user:", err);
            }
        }
        
        // Ensure we have required values
        if (!from) {
            return callback(new Error("Missing required identity or user_id"));
        }

        // Create a new interaction to transfer to Flex
        console.log("Creating new interaction for transfer to human agent");
        const result = await client.flexApi.v1.interaction.create({
            channel: {
                type: channelType,
                initiated_by: "customer",
                properties: {
                    media_channel_sid: conversationsSid,
                },
            },
            routing: {
                properties: {
                    workspace_sid: FLEX_WORKSPACE_SID,
                    workflow_sid: FLEX_WORKFLOW_SID,
                    task_channel_unique_name: "chat",
                    attributes: {
                        from: from,
                        customerName: customerName,
                        customerAddress: customerAddress,
                        conversationSummary: conversation_summary || summary,
                        nextSteps: next_steps,
                        customerName: customer_name || customerName,
                        customerEmail: customer_email,
                        lastOrderSummary: last_order_summary
                    },
                },
            },
        });
        console.log("Successfully created interaction with SID: " + result.sid);
    } catch (err) {
        console.error("Error creating Flex interaction:", err);
        return callback(new Error("Failed to hand over to a human agent"));
    }

    return callback(null, "Transferred to human agent");
};