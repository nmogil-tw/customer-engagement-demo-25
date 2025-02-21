exports.handler = async function (context, event, callback) {
    const client = context.getTwilioClient();
    const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
    const syncDocumentName = event.documentName + "_conversation_summary";
    console.log(syncDocumentName);
    try {
        const document = await client.sync.services(syncServiceSid)
            .documents(syncDocumentName)
            .fetch();
        console.log(document.sid);
        console.log(document.data);
        callback(null, { 
            success: true, 
            conversation_summary: document.data.conversation_summary,
            next_steps: document.data.next_steps,
            customer_name: document.data.customer_name,
            customer_email: document.data.customer_email,
            last_order_summary: document.data.last_order_summary
        });
    } catch (error) {
        callback(null, { success: false, error: error.message });
    }
};
