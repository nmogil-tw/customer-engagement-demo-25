const twilio = require('twilio');

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();

  try {
    // Extract and validate the x-identity header
    const identityHeader = event.request.headers["x-identity"];
    if (!identityHeader) {
      return callback(null, {
        status: 400,
        message: 'Missing x-identity header. Provide phone in the format: "phone:<phone>" or "whatsapp:<phone>".',
      });
    }

    // Parse the identity header to get the phone number
    let toPhoneNumber;
    if (identityHeader.startsWith('phone:')) {
      toPhoneNumber = identityHeader.replace('phone:', '').trim();
    } else if (identityHeader.startsWith('whatsapp:')) {
      toPhoneNumber = identityHeader.replace('whatsapp:', '').trim();
    } else {
      return callback(null, {
        status: 400,
        message: 'Invalid x-identity format. Use "phone:<phone>" or "whatsapp:<phone>".',
      });
    }

    // Validate the message body
    if (!event.body) {
      return callback(null, {
        status: 400,
        message: 'Missing message body. Please provide a "body" property in the request.',
      });
    }

    // Get the from phone number from environment variables
    const fromPhoneNumber = context.TWILIO_SMS_FROM_NUMBER;
    if (!fromPhoneNumber) {
      return callback(null, {
        status: 500,
        message: 'Missing TWILIO_SMS_FROM_NUMBER environment variable.',
      });
    }

    // Send the SMS
    const message = await client.messages.create({
      body: event.body,
      to: toPhoneNumber,
      from: fromPhoneNumber,
    });

    // Return success response
    return callback(null, {
      status: 200,
      message: 'SMS sent successfully',
      messageId: message.sid,
    });

  } catch (error) {
    console.error('Error sending SMS:', error);
    return callback(null, {
      status: 500,
      message: 'Error sending SMS',
      error: error.message,
    });
  }
}; 