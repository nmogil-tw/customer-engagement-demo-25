/**
 * Twilio AI Assistant Context Function
 * 
 * This serverless function retrieves user context for AI Assistants
 * by fetching profile data and interaction history from Twilio APIs.
 * 
 * Required Environment Variables:
 * - ACCOUNT_SID: Your Twilio Account SID
 * - AUTH_TOKEN: Your Twilio Auth Token
 * - FLEX_INSTANCE_SID: Your Flex Instance SID
 * 
 * Required Headers:
 * - x-identity: Identity of the user in one of these formats:
 *   - user_id:<email or phone>
 *   - email:<email>
 *   - phone:<phone>
 *   - whatsapp:<phone>
 * - x-session-id: Unique identifier for the conversation session
 * 
 * Optional Parameters:
 * - uniqueName: Profile unique name for lookup
 * - channel: Communication channel (defaults to 'chat')
 */
exports.handler = async function(context, event, callback) {
    const axios = require('axios');
    const response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    
    // Configure logging
    const log = (level, message, data) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
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
  
    // Basic auth for Twilio API calls
    const auth = {
      username: context.ACCOUNT_SID,
      password: context.AUTH_TOKEN
    };
  
    try {
      // 1. Extract and parse identity from headers
      const identityHeader = event.request && event.request.headers && 
                             event.request.headers['x-identity'] ||
                             event.headers && event.headers['x-identity'];
      
      if (!identityHeader) {
        log('error', 'Missing x-identity header');
        response.setStatusCode(400);
        response.setBody({ error: 'Missing x-identity header' });
        return callback(null, response);
      }
      
      log('info', 'Processing request with identity', { identity: identityHeader });
      
      // Parse identity header according to the specified logic
      let queryField, queryValue;
  
      if (identityHeader.startsWith('user_id:')) {
        const userIdValue = identityHeader.replace(/^user_id:/, '').trim();
        if (userIdValue.includes('@')) {
          // If it contains @, treat as email
          queryField = 'email';
          queryValue = userIdValue;
        } else if (userIdValue.includes('+')) {
          // If it contains +, treat as phone
          queryField = 'phone';
          queryValue = userIdValue;
        } else {
          // Default to email for backward compatibility
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
      
      log('info', 'Parsed identity', { queryField, queryValue });
      
      // 2. Look up profile SID
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
            'UniqueName': event.uniqueName || '',
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
        
        // Add detailed logging of the profiles array
        log('debug', 'Profile lookup data structure', {
          hasData: !!profileLookupResponse.data,
          hasProfiles: !!(profileLookupResponse.data && profileLookupResponse.data.profiles),
          profilesLength: profileLookupResponse.data?.profiles?.length,
          firstProfile: profileLookupResponse.data?.profiles?.[0]
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
      
      // 3. Create new activity and get last 5 activities in parallel
      log('info', 'Creating activity and fetching recent activities in parallel');
      
      // Current timestamp for the new activity
      const timestamp = new Date().toISOString();
      
      // Get session ID from header as the conversation identifier
      const sessionHeader = event.request && event.request.headers && 
                           event.request.headers['x-session-id'] ||
                           event.headers && event.headers['x-session-id'];
      
      // Error out if no x-session-id header is provided
      if (!sessionHeader) {
        log('error', 'Missing x-session-id header');
        response.setStatusCode(400);
        response.setBody({ error: 'Missing x-session-id header' });
        return callback(null, response);
      }
      
      // Use the x-session header as the conversation ID
      const conversationId = sessionHeader;
      
      log('info', 'Using conversation identifier', { conversationId });
      
      // Setup the parallel requests
      const [newActivity, recentActivities] = await Promise.all([
        // Create new activity
        axios({
          method: 'post',
          url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities`,
          auth,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': context.ACCOUNT_SID
          },
          data: new URLSearchParams({
            'Label': 'AI Assistant Conversation',
            'UniqueName': conversationId,
            'Attributes': JSON.stringify({
              'attributes_type': 'CUSTOM', 
              'data': { 
                'channel': event.channel || 'chat'
              }
            }),
            'Timestamp': timestamp
          })
        }).catch(error => {
          log('error', 'Error creating activity', formatError(error));
          return { error };
        }),
        
        // Get last 5 activities
        axios({
          method: 'get',
          url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities?PageSize=5&IncludeDetails=true&ExcludeActivityAttributesType=profile_event`,
          auth,
          headers: {
            'Host': 'preview.twilio.com',
            'I-Twilio-Auth-Account': context.ACCOUNT_SID
          }
        }).catch(error => {
          log('error', 'Error fetching recent activities', formatError(error));
          return { error };
        })
      ]);
      
      // Handle errors from parallel requests
      if (newActivity.error) {
        log('warn', 'Failed to create new activity, continuing with history fetch');
      } else {
        log('info', 'Successfully created new activity', { 
          sid: newActivity.data?.sid,
          label: newActivity.data?.label
        });
      }
      
      if (recentActivities.error) {
        log('error', 'Failed to fetch recent activities');
        response.setStatusCode(500);
        response.setBody({ 
          error: 'Failed to fetch recent activities', 
          details: formatError(recentActivities.error)
        });
        return callback(null, response);
      }
      
      // Process the recent activities
      const activities = recentActivities.data?.activities || [];
      log('info', 'Retrieved recent activities', { count: activities.length });
      
      // 4. Get activity details and notes in parallel
      const activityPromises = activities.map(async (activity) => {
        try {
          // Get detailed activity information
          const detailResponse = await axios({
            method: 'get',
            url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities/${activity.sid}`,
            auth,
            headers: {
              'Host': 'preview.twilio.com',
              'I-Twilio-Auth-Account': context.ACCOUNT_SID
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
                    url: `https://preview.twilio.com/Flex/Instances/${context.FLEX_INSTANCE_SID}/Notes/${detail.note_sid}`,
                    auth,
                    headers: {
                      'Host': 'preview.twilio.com',
                      'I-Twilio-Auth-Account': context.ACCOUNT_SID
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
      
      // 5. Format the final response
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
      
      // Final response object
      const userContext = {
        profile: {
          sid: profileSid,
          identity: {
            type: queryField,
            value: queryValue
          }
        },
        activities: formattedActivities,
        timestamp: timestamp,
        source: 'ai-new-conversation'
      };
      
      log('info', 'Successfully compiled user context', { 
        profileSid, 
        activityCount: formattedActivities.length
      });
      
      // Return the final response
      response.setBody(userContext);
      return callback(null, response);
      
    } catch (error) {
      // Handle any unhandled errors
      log('error', 'Unhandled error in function execution', formatError(error));
      response.setStatusCode(500);
      response.setBody({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
      return callback(null, response);
    }
  };