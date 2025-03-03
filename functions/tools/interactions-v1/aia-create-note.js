const axios = require('axios');

console.log("Executing create_note")
exports.handler = async function(context, event, callback) {
    try {
        // Extract and validate required parameters
        const { interactionSid, content } = event;
        
        if (!interactionSid) {
            console.error('Missing interactionSid parameter');
            return callback(null, {
                status: 400,
                message: 'Missing interactionSid parameter',
            });
        }

        if (!content) {
            console.error('Missing content parameter');
            return callback(null, {
                status: 400,
                message: 'Missing content parameter',
            });
        }

        // Call the createNote function
        const response = await createNote(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            interactionSid,
            content
        );
        
        const data = response.data;
        if(data) {
            console.log("Created Note", JSON.stringify(data))
            return callback(null, data);
        }
        
        return callback(null, null); 
    } catch (error) {
        console.error('Error:', error);
        return callback(error);
    }
};

// Helper function to create a note for an interaction
async function createNote(accountSid, authToken, interactionSid, content) {
    console.log('Creating note for interaction:', interactionSid);
    
    // This is a placeholder URL - replace with the actual Twilio API endpoint for creating notes
    const url = `https://preview.twilio.com/Aion/Instances/GO8c505f73c98244e2b2a9cd3f39bc8749/Interactions/${interactionSid}/Notes`;

    const body = new URLSearchParams();
    body.append('Content', content);
    // Add any other required parameters for the Notes API
    
    try {
        const response = await axios.post(url, body, { 
            headers: { 
                Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
                'host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid,
                'Content-Type': 'application/x-www-form-urlencoded'
            }, 
        });
        
        console.log('Note API response status:', response.status);
        return response;
    } catch (error) {
        console.error('Error in createNote:', error.message);
        console.error('Error response:', error.response?.data);
        throw error;
    }
}
