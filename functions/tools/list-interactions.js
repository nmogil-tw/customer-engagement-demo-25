// This is your new function. To start, set the name and path on the left.
const axios = require('axios');

console.log("Executing list_interactions")
exports.handler = async function(context, event, callback) {
    try {
        // Extract and validate the x-identity header
        const identityHeader = event.request.headers["x-identity"];
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
            return callback(null, {
                status: 400,
                message: 'Invalid x-identity format. Use "email:<email>", "user_id:<email>" or "phone:<phone>".',
            });
        }

        // First find the profile
        const profileResponse = await findProfile(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            "PD3c14c66b961342c52996c9b0b25ab55a",
            { key: queryField, value: queryValue }
        );
        
        const profileData = profileResponse.data;
        let unifiedProfileSid = null;
        
        if(profileData.profiles && profileData.profiles[0] && profileData.profiles[0].profile) {
            unifiedProfileSid = profileData.profiles[0].profile.sid;
        }

        // Then find interactions using the profile SID
        const response = await findInteractions(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            unifiedProfileSid,
            event.interactionStatus
        );
        
        const data = response.data;
        if(data) {
            console.log("Found Interactions", JSON.stringify(data.interactions))
            return callback(null, data);
        }
        return callback(null, null); // Null when not found
    } catch (error) {
        return callback(error);
    }
};

// Helper function to call the Profile Connector API
async function findProfile(accountSid, authToken, uniqueName, attributes) {
    const url = "https://preview.twilio.com/ProfileConnector/Profiles/Find";

    const body = new URLSearchParams();
    body.append('UniqueName', uniqueName);
    body.append('Attributes', JSON.stringify(attributes));
    
    return axios.post(url, body, { 
        headers: { 
            Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
            'Content-Type': 'application/x-www-form-urlencoded'
        }, 
    })
}

// Helper function to call the Profile Connector API
async function findInteractions(accountSid, authToken, unifiedProfileSid, interactionStatus) {
    
    const params = new URLSearchParams();
    if(unifiedProfileSid) {    
        params.append('profileConnectSid', unifiedProfileSid);
    }
    if(interactionStatus) {
        params.append('status', interactionStatus);
    }

    const url = `https://preview.twilio.com/Aion/Instances/GO8c505f73c98244e2b2a9cd3f39bc8749/Interactions?${params.toString()}`;

    return axios.get(url,  { 
        headers: { 
            Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 
            'host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': accountSid,
            'Content-Type': 'application/x-www-form-urlencoded'
        }, 
    })
}