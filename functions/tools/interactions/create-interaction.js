const axios = require('axios');

console.log("Executing create_interaction")
exports.handler = async function(context, event, callback) {
    try {
        // Extract and validate the x-identity header
        const identityHeader = event.request.headers["x-identity"];
        console.log('Received x-identity header:', identityHeader);
        
        if (!identityHeader) {
            console.error('Missing x-identity header');
            return callback(null, {
                status: 400,
                message: 'Missing x-identity header. Provide email or phone in the format: "email:<email>", "user_id:<email>", "phone:<phone>" or "whatsapp:<phone>".',
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
                message: 'Invalid x-identity format. Use "email:<email>", "user_id:<email>", "phone:<phone>" or "whatsapp:<phone>".',
            });
        }

        // Find the profile first
        console.log('Finding profile with attributes:', { key: queryField, value: queryValue });
        const profileResponse = await findProfile(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            "PD3c14c66b961342c52996c9b0b25ab55a",
            { key: queryField, value: queryValue }
        );
        
        console.log('Profile API Response:', JSON.stringify(profileResponse.data));
        console.log('Profile SID:', profileResponse.data?.sid);
        console.log('Full profile response structure:', JSON.stringify(profileResponse.data, null, 2));
        
        const profileData = profileResponse.data;
        let unifiedProfileSid = null;

        if(profileData.profiles && profileData.profiles[0] && profileData.profiles[0].profile) {
            unifiedProfileSid = profileData.profiles[0].profile.sid;
            console.log('Found unified profile SID:', unifiedProfileSid);
        } else {
            return callback(null, {
                status: 404,
                message: 'Profile not found',
            });
        }

        // Create interaction with the found profile
        const response = await createInteraction(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            unifiedProfileSid,
            event.topicSid
        );
        
        const data = response.data;
        if(data) {
            console.log("Created Interaction", JSON.stringify(data))
            return callback(null, data);
        }
        return callback(null, null); 
    } catch (error) {
        console.error('Error:', error);
        return callback(error);
    }
};

// Helper function to find a profile
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

// Helper function to call the Interaction API
async function createInteraction(accountSid, authToken, unifiedProfileSid, topicSid) {
    const url = `https://preview.twilio.com/Aion/Instances/GO8c505f73c98244e2b2a9cd3f39bc8749/Interactions`;

    const body = new URLSearchParams();
    if(unifiedProfileSid) {    
        body.append('ProfileConnectSid', unifiedProfileSid);
    }
    if(topicSid) {    
        body.append('TopicSids', topicSid);
    }
    
    return axios.post(url, body, { 
        headers: { 
            Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
            'host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': accountSid,
            'Content-Type': 'application/x-www-form-urlencoded'
        }, 
    })
}