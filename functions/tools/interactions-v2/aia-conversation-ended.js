const axios = require("axios");

/**
 * Twilio Serverless Function to create a note and optionally close an interaction
 * Required headers:
 * - x-identity: Contains user identification information
 * 
 * Required body:
 * - summary: Summary for the note that will be created
 * - channel: Channel type (e.g., "SMS")
 * - status: Status of the interaction (set to "closed" to close the interaction)
 * - interactionSid: The SID of the interaction
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
    response.appendHeader('Access-Control-Allow-Headers', 'Content-Type, x-identity');
    response.appendHeader('Content-Type', 'application/json');

    // Handle preflight request
    if (event.request && event.request.method === 'OPTIONS') {
        log('info', 'Handling OPTIONS preflight request');
        return callback(null, response);
    }

    try {
        // Extract headers and parse body
        const identityHeader = event.request?.headers?.['x-identity'] || event['x-identity'];
        
        // Parse body - handle both direct event properties and stringified JSON
        let body = event;
        if (typeof event === 'string') {
            try {
                body = JSON.parse(event);
            } catch (e) {
                // If parsing fails, keep original event object
                log('warn', 'Failed to parse event as JSON string', { error: e.message });
            }
        } else if (event.body) {
            // Handle case where body is a string that needs parsing
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        }
        
        log('info', 'Processing request with data', { 
            identityHeader,
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

        if (!body.summary) {
            log('error', 'Missing summary in request body');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required field: summary' 
            });
            return callback(null, response);
        }

        if (!body.interactionSid) {
            log('error', 'Missing interactionSid in request body');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required field: interactionSid' 
            });
            return callback(null, response);
        }

        const interactionSid = body.interactionSid;

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
        
        log('info', 'Profile SID found', { profileSid: profileData.sid });

        // Step 2: Create Flex Interaction Channel
        log('info', 'Creating Flex Interaction Channel');
        const channelData = await createFlexInteractionChannel(
            accountSid,
            authToken,
            flexInstanceSid,
            interactionSid,
            body.channel || "SMS"
        );
        const channelSid = channelData.sid;
        
        log('info', 'Channel created', { channelSid });

        // Wait 1 second to avoid race condition
        await delay(1000);

        // Step 3: Create Flex Interaction Channel Participant - COMMENTED OUT
        /*
        log('info', 'Creating Flex Interaction Channel Participant');
        const participantData = await createFlexInteractionChannelParticipant(
            accountSid,
            authToken,
            flexInstanceSid,
            interactionSid,
            channelSid
        );
        const participantSid = participantData.sid;
        
        log('info', 'Participant created', { participantSid });

        // Wait 1 second to avoid race condition
        await delay(1000);
        */

        // Since we're not creating a participant, set participantSid to null
        const participantSid = null;

        // Step 4: Create Note
        log('info', 'Creating Note');
        const noteData = await createNote(
            accountSid,
            authToken,
            flexInstanceSid,
            interactionSid,
            channelSid,
            participantSid,
            profileSid,
            body.summary
        );
        
        log('info', 'Note created', { noteSid: noteData.sid });

        // Step 5: Close Interaction if status is 'closed'
        let closingResult = null;
        if (body.status === "closed") {
            log('info', 'Closing interaction');
            closingResult = await closeInteraction(
                accountSid,
                authToken,
                flexInstanceSid,
                interactionSid
            );
            
            log('info', 'Interaction closed', { status: closingResult.status });
        }

        // Prepare and send response
        response.setBody({
            success: true,
            message: "Note created successfully",
            profile: { sid: profileSid },
            channel: { sid: channelSid },
            participant: { sid: participantSid },
            note: { sid: noteData.sid },
            interaction: closingResult ? { status: closingResult.status } : { status: "unchanged" }
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
                statusText: error.response.statusText,
                headers: error.response.headers
            };
        } else if (error.request) {
            errorDetails.request = {
                method: error.request.method,
                path: error.request.path,
                headers: error.request.headers
            };
        }

        log('error', 'Error in function execution', errorDetails);
        
        response.setStatusCode(error.response?.status || 500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Error processing the request',
            details: error.response?.data || errorDetails
        });
        
        return callback(null, response);
    }
};

/**
 * Look up a profile SID based on a query field and value
 */
async function lookupProfileSid(accountSid, authToken, queryField, queryValue) {
    const url = 'https://preview.twilio.com/ProfileConnector/Profiles/Find';
    
    // Log the lookup attempt
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Looking up profile with parameters',
        timestamp: new Date().toISOString(),
        data: {
            url,
            queryField,
            queryValue
        }
    }));
    
    const body = new URLSearchParams();
    body.append('UniqueName', '');  // Add UniqueName parameter
    body.append('Attributes', JSON.stringify({ key: queryField, value: queryValue }));
    
    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    
    // Log the complete profile lookup response for debugging
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Profile lookup response structure',
        timestamp: new Date().toISOString(),
        data: {
            hasData: !!response.data,
            hasProfiles: !!(response.data && response.data.profiles),
            profilesLength: response.data?.profiles?.length,
            firstProfile: response.data?.profiles?.[0]
        }
    }));

    // Extract profile SID from response
    if (response.data?.profiles?.[0]?.profile?.sid) {
        const profileSid = response.data.profiles[0].profile.sid;
        console.log(JSON.stringify({
            level: 'info',
            message: 'Found profile',
            timestamp: new Date().toISOString(),
            data: { profileSid }
        }));
        return { sid: profileSid };  // Return in the expected format
    }
    
    // If no profile found, throw a descriptive error
    throw new Error(`Profile not found for ${queryField}: ${queryValue}`);
}

/**
 * Create a Flex Interaction Channel
 */
async function createFlexInteractionChannel(accountSid, authToken, flexInstanceSid, interactionSid, channelType) {
    const url = `https://flex-api.twilio.com/v3/Instances/${flexInstanceSid}/Interactions/${interactionSid}/Channels`;

    const body = new URLSearchParams();
    body.append('Type', channelType);
    body.append('InitiatedBy', 'API');
    body.append('System', 'FLEX');

    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}

/**
 * Create a Flex Interaction Channel Participant
 * This function is currently not being used
 */
/*
async function createFlexInteractionChannelParticipant(accountSid, authToken, flexInstanceSid, interactionSid, channelSid) {
    const url = `https://flex-api.twilio.com/v3/Instances/${flexInstanceSid}/Interactions/${interactionSid}/Channels/${channelSid}/Participants`;

    const body = new URLSearchParams();
    body.append('Type', 'CUSTOMER');
    body.append('MediaProperties', null);
    body.append('System', 'FLEX');

    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}
*/

/**
 * Create a Note
 */
async function createNote(accountSid, authToken, flexInstanceSid, interactionSid, channelSid, participantSid, profileSid, summary) {
    const url = `https://preview.twilio.com/Flex/Instances/${flexInstanceSid}/Notes`;

    // Validate required parameters
    if (!profileSid) {
        throw new Error('ProfileSid is required for creating a note');
    }

    // Log request details
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating note with parameters',
        timestamp: new Date().toISOString(),
        data: {
            url,
            interactionSid,
            channelSid,
            participantSid,
            profileSid,
            summary
        }
    }));

    const body = new URLSearchParams();
    body.append('InteractionSid', interactionSid);
    body.append('ChannelSid', channelSid);
    // Only append ParticipantSid if it exists
    if (participantSid) {
        body.append('ParticipantSid', participantSid);
    }
    body.append('ProfileConnectSid', profileSid);
    body.append('Summary', summary);

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        return response.data;
    } catch (error) {
        // Enhanced error logging for note creation
        console.log(JSON.stringify({
            level: 'error',
            message: 'Failed to create note',
            timestamp: new Date().toISOString(),
            data: {
                status: error.response?.status,
                statusText: error.response?.statusText,
                responseData: error.response?.data,
                requestBody: Object.fromEntries(body),
                errorMessage: error.message
            }
        }));
        throw error;
    }
}

/**
 * Close an Interaction
 */
async function closeInteraction(accountSid, authToken, flexInstanceSid, interactionSid) {
    const url = `https://preview.twilio.com/Aion/Instances/${flexInstanceSid}/Interactions/${interactionSid}`;

    const body = new URLSearchParams();
    body.append('Status', 'closed');
    
    const response = await axios.post(url, body, {
        headers: { 
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': accountSid,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}

/**
 * Helper function to add delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}