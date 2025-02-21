exports.handler = async function(context, event, callback) {
  // Set CORS headers
  const response = new Twilio.Response();
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.appendHeader('Content-Type', 'application/json');

  // Handle preflight request
  if (event.request.method === 'OPTIONS') {
      return callback(null, response);
  }

  try {
      const AccessToken = require('twilio').jwt.AccessToken;
      const { ChatGrant } = AccessToken;
      
      // Get required environment variables
      const accountSid = context.ACCOUNT_SID;
      const apiKey = context.TWILIO_API_KEY;
      const apiSecret = context.TWILIO_API_SECRET;
      const serviceSid = context.TWILIO_CHAT_SERVICE_SID;
      const demoIdentityEmail = context.DEMO_IDENTITY_EMAIL;

      // Validate required environment variables
      if (!accountSid || !apiKey || !apiSecret || !serviceSid) {
          throw new Error('Missing required environment variables');
      }

      // Generate a random identity if none is provided
      // const identity = `customer_${Math.random().toString(36).substring(7)}`;
      const identity = demoIdentityEmail;
      // Create a Chat Grant for this token
      const chatGrant = new ChatGrant({
          serviceSid: serviceSid,
      });
      
      // Create an access token
      const token = new AccessToken(
          accountSid,
          apiKey,
          apiSecret,
          { identity }
      );
      
      // Add the chat grant to the token
      token.addGrant(chatGrant);
      
      // Generate JWT
      const jwt = token.toJwt();
      
      console.log('Token generated successfully for identity:', identity);
      
      // Return success response with token
      response.setBody({
          success: true,
          data: {
              token: jwt
          }
      });
      
      return callback(null, response);
      
  } catch (error) {
      console.error('Error generating token:', error);
      response.setStatusCode(500);
      response.setBody({ 
          success: false, 
          error: error.message || 'Internal server error'
      });
      return callback(null, response);
  }
};