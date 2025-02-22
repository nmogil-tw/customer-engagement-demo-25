// This is your new function. To start, set the name and path on the left.
const axios = require('axios');

console.log("Executing get-profile")
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
        
        console.log('Parsed identity - Field:', queryField, 'Value:', queryValue);

        // Find the profile
        console.log('Finding profile with attributes:', { key: queryField, value: queryValue });
        const profileResponse = await findProfile(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            "PD3c14c66b961342c52996c9b0b25ab55a",
            { key: queryField, value: queryValue }
        );
        
        console.log('Profile API Response:', JSON.stringify(profileResponse.data));
        return callback(null, profileResponse.data);
        
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