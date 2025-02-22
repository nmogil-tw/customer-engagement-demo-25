const axios = require('axios');

console.log("Executing close_interaction")
exports.handler = async function(context, event, callback) {
    try {
        console.log('event', event);
        console.log('status', event.status);
        console.log('interaction', event.interaction);
        // Temporary small delay until everything is hooked up
        const response = await updateInteraction(
            context.ACCOUNT_SID,
            context.AUTH_TOKEN,
            JSON.parse(event.interaction).sid,
            event.status
        );
        const data = response.data;
        if(data) {
        console.log("Updated Interaction", data)
        console.log("Created Interaction status", data['status'])
        return callback(null, data); // return the new Interaction
        }
        // Process the data
        return callback(null, null); 
      } catch (error) {
          return callback(error);
      }
};

// Helper function to call the Interaction API
async function updateInteraction(accountSid, authToken, interactionSid, status) {
    const url = `https://preview.twilio.com/Aion/Instances/GO8c505f73c98244e2b2a9cd3f39bc8749/Interactions/${interactionSid}`;

    const body = new URLSearchParams();
    if(status) {    
        body.append('Status', status);
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