// This is your new function. To start, set the name and path on the left.
const axios = require('axios');

console.log("Executing list_interactions")
exports.handler = async function(context, event, callback) {
    console.log('Handler started with event:', JSON.stringify(event));
    try {
        // Extract and validate the x-identity header
        const identityHeader = event.request.headers["x-identity"];
        console.log('Received x-identity header:', identityHeader);
        
        if (!identityHeader) {
            console.error('Missing x-identity header');
            return callback(null, {
                status: 400,
                message: 'Missing x-identity header. Provide email or phone in the format: "email:<email>" or "phone:<phone>".',
            });
        }

        // Parse the identity header
        let queryField, queryValue;
        if (identityHeader.startsWith('email:') || identityHeader.startsWith('user_id:')) {
            queryField = 'email';
            queryValue = identityHeader.replace(/^(email:|user_id:)/, '').trim();
        } else if (identityHeader.startsWith('phone:')) {
            queryField = 'phone';
            queryValue = identityHeader.replace('phone:', '').trim();
        } else if (identityHeader.startsWith('whatsapp:')) {
            queryField = 'phone';
            queryValue = identityHeader.replace('whatsapp:', '').trim();
        } else {
            console.error('Invalid x-identity format:', identityHeader);
            return callback(null, {
                status: 400,
                message: 'Invalid x-identity format. Use "email:<email>", "user_id:<email>" or "phone:<phone>".',
            });
        }
        
        console.log('Parsed identity header - Field:', queryField, 'Value:', queryValue);

        // First find the profile
        console.log('Finding profile with attributes:', { key: queryField, value: queryValue });
        const profileResponse = await findProfile(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            "PD3c14c66b961342c52996c9b0b25ab55a",
            { key: queryField, value: queryValue }
        );
        
        console.log('Profile API Response:', JSON.stringify(profileResponse.data));
        const profileData = profileResponse.data;
        let unifiedProfileSid = null;
        
        if(profileData.profiles && profileData.profiles[0] && profileData.profiles[0].profile) {
            unifiedProfileSid = profileData.profiles[0].profile.sid;
            console.log('Found unified profile SID:', unifiedProfileSid);
        } else {
            console.log('No unified profile found in response');
        }

        // Then find interactions using the profile SID
        console.log('Finding interactions for profile SID:', unifiedProfileSid, 'Status:', event.status);
        const response = await findInteractions(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            unifiedProfileSid,
            event.status
        );
        
        const data = response.data;
        console.log('Interactions API Response:', JSON.stringify(data));
        
        if(data && data.interactions && data.interactions.length > 0) {
            console.log("Found", data.interactions.length, "interactions");
            // TODO: Use the Timeline API to fetch any notes associated with these open interactions
            // Example: For each interaction, call Timeline API with the interaction SID to get associated notes
            // This will provide additional context about each interaction's history
            return callback(null, data);
        }
        console.log("No interactions found");
        return callback(null, {
            status: 200,
            message: "No Previous open interactions",
            interactions: []
        });
    } catch (error) {
        console.error('Error in handler:', error.message);
        console.error('Error stack:', error.stack);
        return callback(error);
    }
};

// Helper function to call the Profile Connector API
async function findProfile(accountSid, authToken, uniqueName, attributes) {
    console.log('Calling Profile Connector API with uniqueName:', uniqueName, 'attributes:', attributes);
    const url = "https://preview.twilio.com/ProfileConnector/Profiles/Find";

    const body = new URLSearchParams();
    body.append('UniqueName', uniqueName);
    body.append('Attributes', JSON.stringify(attributes));
    
    try {
        const response = await axios.post(url, body, { 
            headers: { 
                Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
                'Content-Type': 'application/x-www-form-urlencoded'
            }, 
        });
        console.log('Profile Connector API response status:', response.status);
        return response;
    } catch (error) {
        console.error('Error in findProfile:', error.message);
        console.error('Error response:', error.response?.data);
        throw error;
    }
}

// Helper function to call the Profile Connector API
async function findInteractions(accountSid, authToken, unifiedProfileSid, status) {
    console.log('Finding interactions with params - profileSid:', unifiedProfileSid, 'status:', status);
    
    const params = new URLSearchParams();
    if(unifiedProfileSid) {    
        params.append('ProfileConnectSid', unifiedProfileSid);
    }
    if(status) {
        params.append('Status', status);
    }

    const url = `https://preview.twilio.com/Aion/Instances/GO8c505f73c98244e2b2a9cd3f39bc8749/Interactions?${params.toString()}`;
    console.log('Calling Interactions API URL:', url);

    try {
        const response = await axios.get(url,  { 
            headers: { 
                Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
                'host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid,
                'Content-Type': 'application/x-www-form-urlencoded'
            }, 
        });
        console.log('Interactions API response status:', response.status);
        return response;
    } catch (error) {
        console.error('Error in findInteractions:', error.message);
        console.error('Error response:', error.response?.data);
        throw error;
    }
}