const axios = require("axios");

/**
 * Twilio Serverless Function to start an AI Assistant conversation
 * Required headers:
 * - x-identity: Contains user identification information
 * - x-session-id: Unique identifier for the session
 * 
 * This function:
 * 1. Creates a new interaction
 * 2. Fetches recent activities, notes, and details
 * 3. Returns a comprehensive response with interaction ID and historical data
 */
exports.handler = async function(context, event, callback) {
    // Initialize logging function
    const log = (level, message, data = {}) => {
        console.log(JSON.stringify({
            level,
            message,
            timestamp: new Date().toISOString(),
            data: typeof data === 'object' ? data : { value: data }
        }));
    };

    // Helper for formatting API errors
    const formatError = (error) => {
        if (error.response) {
            return {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            };
        }
        return {
            message: error.message,
            stack: error.stack
        };
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
        
        log('info', 'Processing request with data', { 
            identityHeader,
            sessionId
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

        // Create auth object for axios
        const auth = {
            username: accountSid,
            password: authToken
        };
        
        // Step 1: Look up profile SID
        log('info', 'Looking up profile SID');
        let profileSid;
        
        try {
            const profileLookupResponse = await axios({
                method: 'post',
                url: 'https://preview.twilio.com/ProfileConnector/Profiles/Find',
                auth,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: new URLSearchParams({
                    'UniqueName': '',
                    'Attributes': JSON.stringify({
                        'key': queryField,
                        'value': queryValue
                    })
                })
            });
            
            log('debug', 'Profile lookup response', { 
                status: profileLookupResponse.status,
                data: profileLookupResponse.data 
            });
            
            // Extract profile SID from response
            if (profileLookupResponse.data && profileLookupResponse.data.profiles && 
                profileLookupResponse.data.profiles.length > 0 &&
                profileLookupResponse.data.profiles[0].profile) {
                
                profileSid = profileLookupResponse.data.profiles[0].profile.sid;
                
                if (!profileSid) {
                    log('error', 'Profile found but SID is missing', { 
                        profile: profileLookupResponse.data.profiles[0].profile 
                    });
                    response.setStatusCode(500);
                    response.setBody({ error: 'Profile found but SID is missing' });
                    return callback(null, response);
                }
                
                log('info', 'Found profile', { profileSid });
            } else {
                log('warn', 'Profile not found', { queryField, queryValue });
                response.setStatusCode(404);
                response.setBody({ error: 'Profile not found' });
                return callback(null, response);
            }
        } catch (error) {
            log('error', 'Error looking up profile', formatError(error));
            response.setStatusCode(error.response?.status || 500);
            response.setBody({ 
                error: 'Error looking up profile', 
                details: formatError(error)
            });
            return callback(null, response);
        }

        // Step 2: Create Interaction
        log('info', 'Creating Interaction');
        let interactionData;
        try {
            const interactionResponse = await axios({
                method: 'post',
                url: `https://preview.twilio.com/Aion/Instances/${flexInstanceSid}/Interactions`,
                auth,
                headers: {
                    'host': 'preview.twilio.com',
                    'I-Twilio-Auth-Account': accountSid,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: new URLSearchParams({
                    'profileConnectSid': profileSid
                })
            });
            
            interactionData = interactionResponse.data;
            const interactionSid = interactionData.sid;
            
            log('info', 'Interaction created', { interactionSid });
        } catch (error) {
            log('error', 'Error creating interaction', formatError(error));
            response.setStatusCode(error.response?.status || 500);
            response.setBody({ 
                error: 'Error creating interaction', 
                details: formatError(error)
            });
            return callback(null, response);
        }

        // Step 3: Get recent activities in parallel
        log('info', 'Fetching recent activities');
        
        // Current timestamp
        const timestamp = new Date().toISOString();
        
        try {
            // Get last 5 activities
            const recentActivitiesResponse = await axios({
                method: 'get',
                url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities?PageSize=5&IncludeDetails=true&ExcludeActivityAttributesType=profile_event`,
                auth,
                headers: {
                    'Host': 'preview.twilio.com',
                    'I-Twilio-Auth-Account': accountSid
                }
            });
            
            // Process the recent activities
            const activities = recentActivitiesResponse.data?.activities || [];
            log('info', 'Retrieved recent activities', { count: activities.length });
            
            // Get activity details and notes in parallel
            const activityPromises = activities.map(async (activity) => {
                try {
                    // Get detailed activity information
                    const detailResponse = await axios({
                        method: 'get',
                        url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities/${activity.sid}`,
                        auth,
                        headers: {
                            'Host': 'preview.twilio.com',
                            'I-Twilio-Auth-Account': accountSid
                        }
                    });
                    
                    const activityDetails = detailResponse.data;
                    log('debug', 'Retrieved activity details', { 
                        sid: activity.sid, 
                        label: activity.label
                    });
                    
                    // Check if this activity has notes
                    const notePromises = [];
                    
                    if (activityDetails.details && activityDetails.details.length > 0) {
                        for (const detail of activityDetails.details) {
                            if (detail.type === 'NOTE' && detail.note_sid) {
                                // Found a note, fetch its details
                                notePromises.push(
                                    axios({
                                        method: 'get',
                                        url: `https://preview.twilio.com/Flex/Instances/${flexInstanceSid}/Notes/${detail.note_sid}`,
                                        auth,
                                        headers: {
                                            'Host': 'preview.twilio.com',
                                            'I-Twilio-Auth-Account': accountSid
                                        }
                                    }).then(noteResponse => {
                                        log('debug', 'Retrieved note', { note_sid: detail.note_sid });
                                        return {
                                            ...detail,
                                            note_content: noteResponse.data
                                        };
                                    }).catch(error => {
                                        log('error', 'Error fetching note details', {
                                            note_sid: detail.note_sid,
                                            error: formatError(error)
                                        });
                                        return {
                                            ...detail,
                                            note_error: formatError(error)
                                        };
                                    })
                                );
                            }
                        }
                    }
                    
                    // Wait for all note requests to complete
                    const notesWithContent = await Promise.all(notePromises);
                    
                    // Combine activity with its notes
                    return {
                        sid: activity.sid,
                        unique_name: activity.unique_name,
                        timestamp: activity.timestamp,
                        label: activity.label,
                        attributes: activity.attributes,
                        details: activityDetails.details || [],
                        notes: notesWithContent
                    };
                } catch (error) {
                    log('error', 'Error processing activity', { 
                        activity_sid: activity.sid, 
                        error: formatError(error)
                    });
                    
                    // Return partial information with error
                    return {
                        sid: activity.sid,
                        unique_name: activity.unique_name,
                        timestamp: activity.timestamp,
                        label: activity.label,
                        error: formatError(error)
                    };
                }
            });
            
            // Wait for all activity processing to complete
            const processedActivities = await Promise.all(activityPromises);
            
            // Format the final activities
            const formattedActivities = processedActivities.map(activity => {
                // Extract note content for easier consumption
                const notes = activity.notes?.map(note => {
                    if (note.note_content) {
                        const content = note.note_content;
                        return {
                            sid: content.sid,
                            type: content.type,
                            summary: content.summary || content.generated_summary,
                            sentiment: content.sentiment || content.generated_sentiment,
                            codes: content.codes,
                            created_at: content.date_created,
                            updated_at: content.date_updated
                        };
                    }
                    return {
                        sid: note.note_sid,
                        error: note.note_error || 'Note content not available'
                    };
                }) || [];
                
                // Format activity
                return {
                    sid: activity.sid,
                    timestamp: activity.timestamp,
                    label: activity.label,
                    type: activity.attributes?.attributesType || activity.attributes?.attributes_type,
                    channel: activity.attributes?.channel_type,
                    direction: activity.attributes?.direction,
                    notes
                };
            });

            // Prepare and send response
            response.setBody({
                success: true,
                message: "Conversation started successfully",
                profile: { 
                    sid: profileSid,
                    identity: {
                        type: queryField,
                        value: queryValue
                    }
                },
                interaction: { 
                    sid: interactionData.sid,
                    status: interactionData.status
                },
                session: {
                    id: sessionId
                },
                history: {
                    activities: formattedActivities,
                    timestamp: timestamp
                }
            });
            
            return callback(null, response);
            
        } catch (error) {
            // If we fail to fetch history, still return with the interaction data
            log('warn', 'Error fetching activity history, returning partial response', formatError(error));
            
            response.setBody({
                success: true,
                message: "Conversation started successfully, but failed to fetch history",
                profile: { 
                    sid: profileSid,
                    identity: {
                        type: queryField,
                        value: queryValue
                    }
                },
                interaction: { 
                    sid: interactionData.sid,
                    status: interactionData.status
                },
                session: {
                    id: sessionId
                },
                historyError: formatError(error)
            });
            
            return callback(null, response);
        }
        
    } catch (error) {
        // Detailed error logging for unhandled errors
        const errorDetails = formatError(error);

        log('error', 'Unhandled error in function execution', errorDetails);
        
        response.setStatusCode(500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Error processing the request',
            details: errorDetails
        });
        
        return callback(null, response);
    }
};