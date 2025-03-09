const axios = require("axios");

/**
 * Helper function to create delays between API calls to prevent race conditions
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Twilio Serverless Function to end an AI Assistant conversation
 * Required headers:
 * - x-identity: Contains user identification information
 * - x-session-id: Unique identifier for the session
 * 
 * Required body:
 * - interactionSid: SID of the interaction to close
 * - summary: Summary of the conversation
 * - channelType: Type of channel (defaults to "SMS")
 */
exports.handler = async function(context, event, callback) {
    // Initialize logging function with enhanced details
    const log = (level, message, data = {}) => {
        console.log(JSON.stringify({
            level,
            message,
            timestamp: new Date().toISOString(),
            functionName: 'aia-conversation-ended',
            data
        }));
    };

    // Log incoming request details
    log('debug', 'Received request', {
        rawEvent: JSON.stringify(event),
        eventKeys: Object.keys(event),
        headers: event.request?.headers || 'No headers in event.request',
        hasBody: !!event.body,
        bodyType: event.body ? typeof event.body : 'undefined'
    });

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
        // Extract headers with detailed logging
        const identityHeader = event.request?.headers?.['x-identity'] || event['x-identity'];
        const sessionId = event.request?.headers?.['x-session-id'] || event['x-session-id'];
        
        log('debug', 'Extracted headers', {
            identityHeader,
            sessionId,
            allHeaders: event.request?.headers || 'No headers object',
            directEventIdentity: event['x-identity'] ? 'Present' : 'Missing',
            directEventSessionId: event['x-session-id'] ? 'Present' : 'Missing'
        });
        
        // Parse body - handle both direct event properties and stringified JSON
        let body = event;
        let bodyParsingMethod = 'Using raw event';
        
        if (typeof event === 'string') {
            try {
                body = JSON.parse(event);
                bodyParsingMethod = 'Parsed event as JSON string';
            } catch (e) {
                // If parsing fails, keep original event object
                log('warn', 'Failed to parse event as JSON string', { 
                    error: e.message,
                    eventString: event.substring(0, 200) + '...' // Log first 200 chars
                });
                bodyParsingMethod = 'Failed to parse string, using raw event';
            }
        } else if (event.body) {
            try {
                // Handle case where body is a string that needs parsing
                if (typeof event.body === 'string') {
                    body = JSON.parse(event.body);
                    bodyParsingMethod = 'Parsed event.body string as JSON';
                } else {
                    body = event.body;
                    bodyParsingMethod = 'Used event.body object directly';
                }
            } catch (e) {
                log('warn', 'Failed to parse event.body as JSON string', {
                    error: e.message,
                    bodyString: typeof event.body === 'string' 
                        ? event.body.substring(0, 200) + '...' 
                        : 'Not a string'
                });
                body = event;
                bodyParsingMethod = 'Failed to parse body, using raw event';
            }
        }
        
        log('info', 'Processing request with data', { 
            identityHeader,
            sessionId,
            bodyParsingMethod,
            bodyKeys: body ? Object.keys(body) : 'No body',
            interactionSid: body.interactionSid,
            hasSummary: !!body.summary,
            channelType: body.channelType || 'Not specified'
        });

        // Log environment variables (redacted)
        log('debug', 'Environment variables check', {
            hasAccountSid: !!context.ACCOUNT_SID,
            hasAuthToken: !!context.AUTH_TOKEN,
            hasFlexInstanceSid: !!context.FLEX_INSTANCE_SID,
            defaultFlexInstanceUsed: !context.FLEX_INSTANCE_SID
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

        if (!body.interactionSid) {
            log('error', 'Missing interactionSid in request body');
            response.setStatusCode(400);
            response.setBody({ 
                error: 'Missing required field: interactionSid' 
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

        const interactionSid = body.interactionSid;
        const channelType = body.channelType || "SMS";

        // Parse identity header to get query field and value
        let queryField, queryValue;
    
        if (identityHeader.startsWith('user_id:')) {
            const userIdValue = identityHeader.replace(/^user_id:/, '').trim();
            log('debug', 'Processing user_id identity format', { userIdValue });
            
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
            log('error', 'Invalid x-identity format', { 
                identity: identityHeader,
                startsWithUserId: identityHeader.startsWith('user_id:'),
                startsWithEmail: identityHeader.startsWith('email:'),
                startsWithPhone: identityHeader.startsWith('phone:'),
                startsWithWhatsapp: identityHeader.startsWith('whatsapp:')
            });
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
        log('info', 'Looking up profile SID', { queryField, queryValue });
        
        try {
            const profileData = await lookupProfileSid(accountSid, authToken, queryField, queryValue);
            const profileSid = profileData.sid;
            
            log('info', 'Profile SID found', { profileSid });
            
            // Step 2: Create Timeline Activity - ENHANCED LOGGING
            log('info', 'Creating Timeline Activity', { 
                profileSid, 
                interactionSid, 
                sessionId, 
                channelType 
            });
            
            const currentTimestamp = new Date().toISOString();
            
            try {
                const timelineData = await createTimelineActivity(
                    accountSid,
                    authToken,
                    profileSid,
                    interactionSid,
                    sessionId,
                    channelType,
                    currentTimestamp
                );
                
                // More detailed logging to ensure we can see if this step completes
                log('info', 'Timeline Activity created', { 
                    timelineSid: timelineData.activity?.sid || 'No SID in response',
                    uniqueName: timelineData.activity?.unique_name || 'No unique name',
                    responseStatus: !!timelineData ? 'Response received' : 'No response data'
                });
                
                // Store activity SID for later use
                const timelineActivitySid = timelineData.activity?.sid;
                
                if (!timelineActivitySid) {
                    throw new Error('Timeline Activity creation failed: No activity SID returned');
                }
                
                // Add a verification step to ensure the activity was created
                log('debug', 'Verifying Timeline Activity was created successfully');
                try {
                    const verifyUrl = `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities/${interactionSid}`;
                    const verifyResponse = await axios.get(verifyUrl, {
                        headers: { 
                            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                            'Host': 'preview.twilio.com',
                            'I-Twilio-Auth-Account': accountSid
                        }
                    });
                    
                    log('debug', 'Timeline Activity verification successful', {
                        activitySid: verifyResponse.data?.sid,
                        status: verifyResponse.status
                    });
                } catch (verifyError) {
                    log('error', 'Timeline Activity verification failed', {
                        error: verifyError.message,
                        profileSid,
                        interactionSid
                    });
                    throw new Error(`Failed to verify Timeline Activity creation: ${verifyError.message}`);
                }
                
                // Step 3: Create Flex Interaction Channel
                log('info', 'Creating Flex Interaction Channel');
                
                try {
                    const channelData = await createFlexInteractionChannel(
                        accountSid,
                        authToken,
                        flexInstanceSid,
                        interactionSid,
                        channelType
                    );
                    const channelSid = channelData.sid;
                    
                    log('info', 'Channel created', { 
                        channelSid,
                        channelStatus: channelData.status || 'No status'
                    });
                    
                    // Wait for 2 seconds to avoid race conditions
                    log('debug', 'Delaying for 2 seconds to avoid race conditions');
                    await delay(2000);
                    
                    // Step 4: Create Participant
                    log('info', 'Creating Participant');
                    
                    try {
                        const participantData = await createParticipant(
                            accountSid,
                            authToken,
                            flexInstanceSid,
                            interactionSid,
                            channelSid
                        );
                        const participantSid = participantData.sid;
                        
                        log('info', 'Participant created', { 
                            participantSid,
                            participantStatus: participantData.status || 'No status' 
                        });
                        
                        // Wait for 2 seconds to avoid race conditions
                        log('debug', 'Delaying for 2 seconds to avoid race conditions');
                        await delay(2000);
                        
                        // Step 5: Create Note
                        log('info', 'Creating Note');
                        
                        try {
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
                            
                            log('info', 'Note created', { 
                                noteSid: noteData.sid || 'No SID in response',
                                noteResponse: JSON.stringify(noteData).substring(0, 200) + '...'
                            });
                            
                            // Step 6: Add Channel Activity Detail
                            log('info', 'Adding Channel Activity Detail');
                            
                            // Wait for 2 seconds to avoid race conditions
                            log('debug', 'Delaying for 2 seconds before adding channel activity detail');
                            await delay(2000);
                            
                            try {
                                const channelDetailData = await addChannelActivityDetail(
                                    accountSid,
                                    authToken,
                                    profileSid,
                                    interactionSid,
                                    channelSid,
                                    participantSid,
                                    channelType,
                                    body.summary,
                                    currentTimestamp
                                );
                                
                                log('info', 'Channel Activity Detail added', {
                                    detailsCount: channelDetailData.details?.length || 0,
                                    detailResponse: JSON.stringify(channelDetailData).substring(0, 200) + '...'
                                });
                                
                                // Prepare and send response
                                log('info', 'Preparing successful response');
                                response.setBody({
                                    success: true,
                                    message: "Conversation ended successfully",
                                    profile: { sid: profileSid },
                                    interaction: { 
                                        sid: interactionSid,
                                        status: "unchanged"
                                    },
                                    channel: { sid: channelSid },
                                    participant: { sid: participantSid },
                                    timeline: { sid: timelineActivitySid },
                                    note: { sid: noteData.sid },
                                    session: { id: sessionId }
                                });
                                
                                return callback(null, response);
                                
                            } catch (detailError) {
                                throw new Error(`Failed to add channel activity detail: ${detailError.message}`);
                            }
                            
                        } catch (noteError) {
                            throw new Error(`Failed to create note: ${noteError.message}`);
                        }
                        
                    } catch (participantError) {
                        throw new Error(`Failed to create participant: ${participantError.message}`);
                    }
                    
                } catch (channelError) {
                    throw new Error(`Failed to create flex interaction channel: ${channelError.message}`);
                }
                
            } catch (timelineError) {
                throw new Error(`Failed to create timeline activity: ${timelineError.message}`);
            }
            
        } catch (profileError) {
            throw new Error(`Failed to lookup profile SID: ${profileError.message}`);
        }
        
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
                data: typeof error.response.data === 'object' 
                    ? JSON.stringify(error.response.data).substring(0, 500) 
                    : String(error.response.data).substring(0, 500),
                status: error.response.status,
                statusText: error.response.statusText,
                headers: JSON.stringify(error.response.headers).substring(0, 200)
            };
        } else if (error.request) {
            errorDetails.request = {
                method: error.request.method,
                path: error.request.path,
                host: error.request.host,
                headers: JSON.stringify(error.request._header).substring(0, 200)
            };
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
    body.append('UniqueName', '');  // Add UniqueName parameter
    body.append('Attributes', JSON.stringify({ key: queryField, value: queryValue }));
    
    console.log(JSON.stringify({
        level: 'debug',
        message: 'Looking up profile with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            queryField,
            queryValue,
            attributes: JSON.stringify({ key: queryField, value: queryValue }),
            requestBody: body.toString()
        }
    }));
    
    try {
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
            data: {
                status: response.status,
                hasProfiles: !!response.data?.profiles,
                profilesCount: response.data?.profiles?.length || 0,
                responseData: JSON.stringify(response.data).substring(0, 500) + '...'
            }
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
            console.log(JSON.stringify({
                level: 'error',
                message: 'Profile not found in response',
                timestamp: new Date().toISOString(),
                data: { 
                    responseStructure: JSON.stringify(response.data),
                    hasProfiles: !!response.data?.profiles,
                    profilesCount: response.data?.profiles?.length || 0
                }
            }));
            throw new Error('Profile not found');
        }
        
        return { sid: profileSid };
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error looking up profile',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200)
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}

/**
 * Create a Timeline Activity
 */
async function createTimelineActivity(accountSid, authToken, profileSid, interactionSid, sessionId, channelType, timestamp) {
    const url = `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities`;
    
    // Match exactly with the CURL command parameters and format
    const attributes = {
        attributes_type: "INTERACTION",
        label: "AI Assistant Conversation",
        interaction_sid: interactionSid,
        channel_type: channelType,
        direction: "INBOUND",
        duration: 60
    };

    const body = new URLSearchParams();
    body.append('Label', 'AI Assistant Conversation');
    // Critical: This ensures the activity can be found by interactionSid later
    body.append('UniqueName', interactionSid);
    body.append('Attributes', JSON.stringify(attributes));
    body.append('Timestamp', timestamp);

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating timeline activity with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            profileSid,
            interactionSid,
            attributes: JSON.stringify(attributes),
            timestamp,
            requestBody: body.toString()
        }
    }));

    try {
        // Ensure proper Authorization and request formatting
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Validate response has the expected structure
        if (!response.data || !response.data.activity || !response.data.activity.sid) {
            console.log(JSON.stringify({
                level: 'error',
                message: 'Timeline activity creation returned unexpected response structure',
                timestamp: new Date().toISOString(),
                data: {
                    status: response.status,
                    responseData: JSON.stringify(response.data).substring(0, 500) + '...'
                }
            }));
            throw new Error('Timeline activity creation returned unexpected response structure');
        }

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Timeline activity creation response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                hasActivity: !!response.data?.activity,
                activitySid: response.data?.activity?.sid,
                uniqueName: response.data?.activity?.unique_name,
                responseData: JSON.stringify(response.data).substring(0, 500) + '...'
            }
        }));

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error creating timeline activity',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                url: url,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200) 
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}

// The remaining functions would be enhanced similarly with try/catch blocks and better logging
// For brevity, I'm showing the pattern for the first two functions

/**
 * Create a Flex Interaction Channel
 */
async function createFlexInteractionChannel(accountSid, authToken, flexInstanceSid, interactionSid, channelType) {
    const url = `https://flex-api.twilio.com/v3/Instances/${flexInstanceSid}/Interactions/${interactionSid}/Channels`;

    // Match exactly with the CURL command parameters
    const body = new URLSearchParams();
    body.append('Type', channelType);
    body.append('InitiatedBy', 'API');
    body.append('System', 'FLEX');
    body.append('Status', 'ACTIVE');

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating flex interaction channel with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            flexInstanceSid,
            interactionSid,
            channelType,
            requestBody: body.toString()
        }
    }));

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Flex interaction channel creation response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                channelSid: response.data?.sid || 'No SID in response',
                channelStatus: response.data?.status || 'No status in response',
                responseData: JSON.stringify(response.data).substring(0, 300)
            }
        }));

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error creating flex interaction channel',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200)
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}

/**
 * Create a Participant
 */
async function createParticipant(accountSid, authToken, flexInstanceSid, interactionSid, channelSid) {
    const url = `https://flex-api.twilio.com/v3/Instances/${flexInstanceSid}/Interactions/${interactionSid}/Channels/${channelSid}/Participants`;

    // Match exactly with the CURL command parameters
    const body = new URLSearchParams();
    body.append('Type', 'user');
    body.append('System', 'FLEX');
    body.append('MediaProperties', null);

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating participant with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            flexInstanceSid,
            interactionSid,
            channelSid,
            requestBody: body.toString()
        }
    }));

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Participant creation response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                participantSid: response.data?.sid || 'No SID in response',
                participantStatus: response.data?.status || 'No status in response',
                responseData: JSON.stringify(response.data)
            }
        }));

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error creating participant',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200)
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}

/**
 * Create a Note
 */
async function createNote(accountSid, authToken, flexInstanceSid, interactionSid, channelSid, participantSid, profileSid, summary) {
    const url = `https://preview.twilio.com/Flex/Instances/${flexInstanceSid}/Notes`;

    // Prepare the summary with an AI Assistant prefix
    const formattedSummary = summary.startsWith('AI Assistant:') ? summary : `AI Assistant: ${summary}`;

    // Match codes format from CURL example exactly
    const codes = {
        generated: [
            {
                disposition_code: "Status",
                topic_path: "Refund request|Cancel purchase"
            }
        ],
        selected: [
            {
                disposition_code: "Status",
                topic_path: "Refund request|Cancel purchase"
            }
        ]
    };

    const body = new URLSearchParams();
    body.append('InteractionSid', interactionSid);
    body.append('ChannelSid', channelSid);
    body.append('ParticipantSid', participantSid);
    body.append('ProfileConnectSid', profileSid);
    body.append('Summary', formattedSummary);
    body.append('Codes', JSON.stringify(codes));

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Creating note with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            flexInstanceSid,
            interactionSid,
            channelSid,
            participantSid,
            profileSid,
            summary: formattedSummary,
            requestBody: body.toString()
        }
    }));

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Note creation response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                noteSid: response.data?.sid || 'No SID in response',
                responseData: JSON.stringify(response.data).substring(0, 300)
            }
        }));

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error creating note',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200)
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}

/**
 * Add Channel Activity Detail - Updated to specifically check for activity
 */
async function addChannelActivityDetail(accountSid, authToken, profileSid, interactionSid, channelSid, participantSid, channelType, summary, timestamp) {
    // First verify the activity exists
    try {
        const checkUrl = `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities/${interactionSid}`;
        const checkResponse = await axios.get(checkUrl, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid
            }
        });
        
        console.log(JSON.stringify({
            level: 'debug',
            message: 'Verified Timeline Activity exists before adding detail',
            timestamp: new Date().toISOString(),
            data: {
                status: checkResponse.status,
                activitySid: checkResponse.data?.sid,
                uniqueName: checkResponse.data?.unique_name
            }
        }));
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Timeline Activity not found before adding detail',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                profileSid,
                interactionSid
            }
        }));
        throw new Error(`Timeline Activity with UniqueName=${interactionSid} not found. Cannot add detail.`);
    }
    
    // Original function continues below
    const url = `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities/${interactionSid}/Details`;

    // Create detail object - matching exact format from CURL example
    const detail = {
        type: "CHANNEL",
        label: "AI Assistant Conversation",
        summary: summary,
        channel_sid: channelSid,
        channel_type: channelType,
        direction: "INBOUND",
        participants: [
            {
                sid: participantSid,
                media_participant_type: "CUSTOMER",
                timestamp: timestamp,
                media_participant_sid: "MB0a189268d65d44548b15ec75764b573b",
                task_sid: "WT5f8aecc3217f01a3c5e732245f4d026d"
            },
            {
                worker_sid: "WK1d69a6369fd710ff0b217dfc63122f2e",
                task_sid: "WT5f8aecc3217f01a3c5e732245f4d026d",
                timestamp: timestamp,
                media_participant_sid: "MB685a645a169d4167ab392147f3c1cc69",
                sid: participantSid,
                media_participant_type: "AGENT"
            }
        ],
        timestamp: timestamp
    };

    const body = new URLSearchParams();
    body.append('Detail', JSON.stringify(detail));

    console.log(JSON.stringify({
        level: 'debug',
        message: 'Adding channel activity detail with details',
        timestamp: new Date().toISOString(),
        data: {
            url,
            profileSid,
            interactionSid,
            detail: JSON.stringify(detail).substring(0, 300) + '...',
            requestBody: body.toString().substring(0, 300) + '...'
        }
    }));

    try {
        const response = await axios.post(url, body, {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
                'Host': 'preview.twilio.com',
                'I-Twilio-Auth-Account': accountSid,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(JSON.stringify({
            level: 'debug',
            message: 'Channel activity detail response',
            timestamp: new Date().toISOString(),
            data: {
                status: response.status,
                detailsCount: response.data?.details?.length || 0,
                responseData: JSON.stringify(response.data).substring(0, 300) + '...'
            }
        }));

        return response.data;
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Error adding channel activity detail',
            timestamp: new Date().toISOString(),
            data: {
                error: error.message,
                response: error.response ? {
                    status: error.response.status,
                    data: JSON.stringify(error.response.data).substring(0, 200)
                } : 'No response',
                request: error.request ? 'Request was made but no response received' : 'No request was made'
            }
        }));
        throw error;
    }
}