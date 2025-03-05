const axios = require("axios");

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
        // Segment Write Key and API endpoints
        const SEGMENT_WRITE_KEY = context.SEGMENT_WRITE_KEY;
        const SEGMENT_TRACK_URL = "https://api.segment.io/v1/track";
        const SEGMENT_IDENTIFY_URL = "https://api.segment.io/v1/identify";

        // Extract form and order data
        const { formData, orderData } = event;

        // Basic auth for Twilio API calls
        const auth = {
            username: context.ACCOUNT_SID,
            password: context.AUTH_TOKEN
        };

        // First, look up profile SID using email
        const profileLookupResponse = await axios({
            method: 'post',
            url: 'https://preview.twilio.com/ProfileConnector/Profiles/Find',
            auth,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: new URLSearchParams({
                'Attributes': JSON.stringify({
                    'key': 'email',
                    'value': formData.email
                })
            })
        });

        let profileSid;
        if (profileLookupResponse.data && 
            profileLookupResponse.data.profiles && 
            profileLookupResponse.data.profiles.length > 0 &&
            profileLookupResponse.data.profiles[0].profile) {
            profileSid = profileLookupResponse.data.profiles[0].profile.sid;
        }

        if (profileSid) {
            // Create an Activity for the order
            const timestamp = new Date().toISOString();
            await axios({
                method: 'post',
                url: `https://preview.twilio.com/Timeline/Profiles/${profileSid}/Activities`,
                auth,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': 'preview.twilio.com',
                    'I-Twilio-Auth-Account': context.ACCOUNT_SID
                },
                data: new URLSearchParams({
                    'Label': 'Order Placed',
                    'UniqueName': orderData.order_id,
                    'Attributes': JSON.stringify({
                        'attributes_type': 'CUSTOM',
                        'data': {
                            'channel': 'web',
                            'orderId': orderData.order_id,
                            'totalAmount': orderData.total_amount,
                            'items': orderData.items
                        }
                    }),
                    'Timestamp': timestamp
                })
            });
        }

        // Construct Identify payload
        const identifyPayload = {
            userId: formData.email,
            traits: {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                phone: formData.phone,
                address: formData.address,
                city: formData.city,
                state: formData.state,
                zipCode: formData.zipCode,
            },
        };

        // Send Identify request to Segment
        await axios.post(SEGMENT_IDENTIFY_URL, identifyPayload, {
            auth: { username: SEGMENT_WRITE_KEY, password: "" },
        });

        console.log("Identify event sent to Segment:", identifyPayload);

        // Construct Track payload
        const trackPayload = {
            userId: formData.email,
            event: "Order Placed",
            properties: {
                orderId: orderData.order_id,
                totalAmount: orderData.total_amount,
                items: orderData.items
            },
        };

        // Send Track request to Segment
        await axios.post(SEGMENT_TRACK_URL, trackPayload, {
            auth: { username: SEGMENT_WRITE_KEY, password: "" },
        });

        console.log("Track event sent to Segment:", trackPayload);

        response.setBody({
            success: true,
            message: "Data sent to Segment and Activity created successfully"
        });
        
        return callback(null, response);
        
    } catch (error) {
        console.error("Error in function execution:", error.message);
        response.setStatusCode(500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Error in function execution'
        });
        return callback(null, response);
    }
};