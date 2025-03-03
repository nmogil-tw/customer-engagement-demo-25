const axios = require("axios");

/**
 * Twilio Serverless Function to create an interaction and add it to the timeline
 * Required headers:
 * - x-identity: Contains user identification information
 * - x-session-id: Unique identifier for the session
 * 
 * Required body:
 * - label: Label for the timeline activity (e.g., "Order Cancellation")
 */
exports.handler = async function(context, event, callback) {
    // Initialize logging function
    const log = (level, message, data = {}) => {
        console.log(JSON.stringify({
            level,
            message,
            timestamp: new Date().toISOString(),
            data
        }));
    };

    // Set CORS headers
    const response = new Twilio.Response();
    response.appendHeader('Access-Control-Allow-Origin', '*');
    response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.appendHeader('Access-Control-Allow-Headers', 'Content-Type, x-identity, x-session-id');
    response.appendHeader('Content-Type', 'application/json');

    // Handle preflight request
    if (event.request && event.request.method === 'OPTIONS') {
        log('info', 'Handling OPTIONS preflight request');
        return callback(null, response);
    }

    try {
        // Extract headers
        const identityHeader = event.request?.headers?.['x-identity'] || event['x-identity'];
        const sessionId = event.request?.headers?.['x-session-id'] || event['x-session-id'];
        
        // Parse body - handle both direct event properties and stringified JSON
        let body = event;
        if (typeof event === 'string') {
            try {
                body = JSON.parse(event);
            } catch (e) {
                // If parsing fails, keep original event object
                log('warn', 'Failed to parse event as JSON string', { error: e.message });
            }
        }
        
        log('info', 'Processing request with data', { 
            identityHeader,
            sessionId,
            body
        });

        // Validate required inputs
        if (!identityHeader) {
            log('error', 'Missing x-identity header');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required header: x-identity' 
            });
            return callback(null, response);
        }

        if (!sessionId) {
            log('error', 'Missing x-session-id header');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required header: x-session-id' 
            });
            return callback(null, response);
        }

        if (!body.label) {
            log('error', 'Missing label in request body');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required field: label' 
            });
            return callback(null, response);
        }

        // Parse identity header to get query field and value
        let queryField, queryValue;
    
        if (identityHeader.startsWith('user_id:')) {
            const userIdValue = identityHeader.replace(/^user_id:/, '').trim();
            if (userIdValue.includes('@')) {
                queryField = 'email';
                queryValue = userIdValue;
            } else if (userIdValue.includes('+')) {
                queryField = 'phone';
                queryValue = userIdValue;
            } else {
                queryField = 'email';
                queryValue = userIdValue;
            }
        } else if (identityHeader.startsWith('email:')) {
            queryField = 'email';
            queryValue = identityHeader.replace(/^email:/, '').trim();
        } else if (identityHeader.startsWith('phone:')) {
            queryField = 'phone';
            queryValue = identityHeader.replace(/^phone:/, '').trim();
        } else if (identityHeader.startsWith('whatsapp:')) {
            queryField = 'phone';
            queryValue = identityHeader.replace(/^whatsapp:/, '').trim();
        } else {
            log('error', 'Invalid x-identity format', { identity: identityHeader });
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Invalid x-identity format. Use "email:<email>", "user_id:<email or phone>" or "phone:<phone>".' 
            });
            return callback(null, response);
        }

        log('info', 'Successfully parsed identity', { queryField, queryValue });

        // Set up authentication for all API calls
        const accountSid = context.ACCOUNT_SID;
        const authToken = context.AUTH_TOKEN;
        const flexInstanceSid = context.FLEX_INSTANCE_SID || "GO8c505f73c98244e2b2a9cd3f39bc8749";
        
        // Step 1: Look up profile SID
        log('info', 'Looking up profile SID');
        const profileData = await lookupProfileSid(accountSid, authToken, queryField, queryValue);
        const profileSid = profileData.sid;
        
        log('info', 'Profile SID found', { profileSid });

        // Step 2: Create Interaction
        log('info', 'Creating Interaction');
        const interactionData = await createInteraction(
            accountSid,
            authToken,
            flexInstanceSid,
            profileSid
        );
        const interactionSid = interactionData.sid;
        
        log('info', 'Interaction created', { interactionSid });

        // Step 3: Add to Timeline
        log('info', 'Adding to Timeline');
        const timelineData = await addToTimeline(
            accountSid,
            authToken,
            profileSid,
            interactionSid,
            body.label,
            sessionId
        );
        
        log('info', 'Added to Timeline', { 
            timelineSid: timelineData.sid 
        });

        // Prepare and send response
        response.setBody({
            success: true,
            message: "Interaction created and added to timeline successfully",
            profile: { sid: profileSid },
            interaction: { 
                sid: interactionSid,
                status: interactionData.status
            },
            timeline: { 
                sid: timelineData.sid 
            }
        });
        
        return callback(null, response);
        
    } catch (error) {
        // Detailed error logging
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            name: error.name
        };

        // Add axios-specific error data if available
        if (error.response) {
            errorDetails.response = {
                data: error.response.data,
                status: error.response.status,
                headers: error.response.headers
            };
        } else if (error.request) {
            errorDetails.request = error.request;
        }

        log('error', 'Error in function execution', errorDetails);
        
        response.setStatusCode(500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Error processing the request',
            errorDetails: process.env.NODE_ENV === 'development' ? errorDetails : undefined
        });
        
        return callback(null, response);
    }
};

/**
 * Look up a profile SID based on a query field and value
 */
async function lookupProfileSid(accountSid, authToken, queryField, queryValue) {
    const url = 'https://preview.twilio.com/ProfileConnector/Profiles/Find';
    
    const body = new URLSearchParams();
    body.append('Attributes', JSON.stringify({ key: queryField, value: queryValue }));
    
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Looking up profile with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            queryField,
            queryValue,
            attributes: JSON.stringify({ key: queryField, value: queryValue })
        }
    }));
    
    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Profile lookup response',
        timestamp: new Date().toISOString(),
        data: response.data
    }));
    
    // Extract profile SID from response
    let profileSid;
    if (response.data && response.data.profiles && 
        response.data.profiles.length > 0 &&
        response.data.profiles[0].profile) {
        
        profileSid = response.data.profiles[0].profile.sid;
        
        console.log(JSON.stringify({
            level: 'info',
            message: 'Profile SID found',
            timestamp: new Date().toISOString(),
            data: { profileSid }
        }));
        
        if (!profileSid) {
            throw new Error('Profile found but SID is missing');
        }
    } else {
        throw new Error('Profile not found');
    }
    
    return { sid: profileSid };
}

/**
 * Create an Interaction
 */
async function createInteraction(accountSid, authToken, flexInstanceSid, profileSid) {
    const url = `https://preview.twilio.com/Aion/Instances/${flexInstanceSid}/Interactions`;

    const body = new URLSearchParams();
    body.append('profileConnectSid', profileSid);

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating interaction with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            flexInstanceSid,
            profileSid
        }
    }));

    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': accountSid,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Interaction creation response',
        timestamp: new Date().toISOString(),
        data: {
            status: response.status,
            interactionSid: response.data.sid,
            interactionData: response.data
        }
    }));

    // Add a delay of 2 seconds after creating the interaction (increased from 1 second)
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Waiting 2 seconds before adding to timeline',
        timestamp: new Date().toISOString()
    }));
    await new Promise(resolve => setTimeout(resolve, 2000));

    return response.data;
}

/**
 * Add an interaction to the Timeline
 */
async function addToTimeline(accountSid, authToken, profileSid, interactionSid, label, sessionId) {
    const url = `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities`;

    const currentTimestamp = new Date().toISOString();
    
    const attributes = {
        attributes_type: "CUSTOM",
        data: {
            sessionId: sessionId
        }
    };

    const body = new URLSearchParams();
    body.append('Label', label);
    body.append('UniqueName', interactionSid);
    body.append('Attributes', JSON.stringify(attributes));
    body.append('Timestamp', currentTimestamp);

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Adding to timeline with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            profileSid,
            interactionSid,
            label,
            sessionId,
            attributes: JSON.stringify(attributes),
            requestBody: {
                Label: label,
                UniqueName: interactionSid,
                Attributes: JSON.stringify(attributes),
                Timestamp: currentTimestamp
            }
        }
    }));

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Timeline addition response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                statusText: response.statusText,
                responseData: response.data,
                responseHeaders: response.headers
            }
        }));

        if (response.status === 404) {
            console.log(JSON.stringify({
                level: 'warn',
                message: 'Received 404 for timeline addition, retrying after delay',
                timestamp: new Date().toISOString(),
                data: {
                    url,
                    profileSid,
                    responseStatus: response.status
                }
            }));
            
            // If we get a 404, wait 3 seconds and try one more time (increased from 1 second)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log(JSON.stringify({
                level: 'debug',
                message: 'Retrying timeline addition after delay',
                timestamp: new Date().toISOString()
            }));
            
            const retryResponse = await axios.post(url, body, {
                headers: { 
                    'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                    'Host': 'preview.twilio.com',
                    'I-Twilio-Auth-Account': accountSid,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            console.log(JSON.stringify({
                level: 'debug',
                message: 'Timeline addition retry response',
                timestamp: new Date().toISOString(),
                data: {
                    status: retryResponse.status,
                    statusText: retryResponse.statusText,
                    responseData: retryResponse.data
                }
            }));
            
            return retryResponse.data;
        }

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error in addToTimeline function',
            timestamp: new Date().toISOString(),
            data: {
                errorMessage: error.message,
                errorName: error.name,
                url,
                profileSid,
                interactionSid,
                responseData: error.response ? error.response.data : null,
                responseStatus: error.response ? error.response.status : null,
                responseHeaders: error.response ? error.response.headers : null
            }
        }));
        throw error;
    }
}