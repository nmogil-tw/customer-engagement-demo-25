/**
 * @param {import('@twilio-labs/serverless-runtime-types/types').Context} context
 * @param {{}} event
 * @param {import('@twilio-labs/serverless-runtime-types/types').ServerlessCallback} callback
 */
exports.handler = async function(context, event, callback) {
    const client = context.getTwilioClient();
    const sessionId = event.request.headers['x-session-id'];
    const {
        conversation_summary,
        next_steps,
        customer_name,
        customer_email,
        last_order_summary
    } = event;
    console.log("conversation_summary " + conversation_summary);
    if (sessionId.startsWith('voice:')) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const twilioAccountSid = context.ACCOUNT_SID;
        const flexVoiceStudioFlow = context.TWILIO_FLEX_VOICE_STUDIO_FLOW;
        const [callSid] = sessionId.replace('voice:', '').split('/')
        const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
        const syncDocumentName = callSid + '_conversation_summary';
        console.log(syncDocumentName);

        // Save all relevant properties to Sync
        if (conversation_summary || next_steps || customer_name || customer_email || last_order_summary) {
            const syncData = {
                conversation_summary,
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

    //Not a voice call
    const FLEX_WORKFLOW_SID = event.FlexWorkflowSid || context.FLEX_WORKFLOW_SID;
    const FLEX_WORKSPACE_SID =
        event.FlexWorkspaceSid || context.FLEX_WORKSPACE_SID;

    if (!FLEX_WORKFLOW_SID || !FLEX_WORKSPACE_SID) {
        return callback(
            new Error(
                "Missing configuration for FLEX_WORKSPACE_SID OR FLEX_WORKFLOW_SID"
            )
        );
    }
    console.log(event.request.headers["x-session-id"]);
    const [serviceSid, conversationsSid] = event.request.headers["x-session-id"]
        ?.replace("conversations__", "")
        .split("/");
    const [traitName, identity] = event.request.headers["x-identity"]?.split(":");

    if (!identity || !conversationsSid) {
        return callback(new Error("Invalid request"));
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
                console.error(err);
            }
        }
        // Default to chat for all other cases

        // Ensure we have required values
        if (!from) {
            return callback(new Error("Missing required identity or user_id"));
        }

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
                        conversationSummary: conversation_summary,
                        nextSteps: next_steps,
                        customerName: customer_name || customerName,
                        customerEmail: customer_email,
                        lastOrderSummary: last_order_summary
                    },
                },
            },
        });
        console.log(result.sid);
    } catch (err) {
        console.error(err);
        return callback(new Error("Failed to hand over to a human agent"));
    }

    return callback(null, "Transferred to human agent");
};