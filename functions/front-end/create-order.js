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
        const client = require('airtable');
        const base = new client({apiKey: context.AIRTABLE_API_KEY}).base(context.AIRTABLE_BASE_ID);
        
        const { items, totalAmount, customerId, email, phone } = event;
        
        // Debug logging
        console.log('Received order data:', {
            items: items || 'missing',
            totalAmount: totalAmount || 'missing',
            customerId: customerId || 'missing',
            email: email || 'missing',
            phone: phone || 'missing'
        });
        
        // Validate required fields with specific error message
        const missingFields = [];
        if (!items) missingFields.push('items');
        if (!totalAmount) missingFields.push('totalAmount');
        if (!customerId) missingFields.push('customerId');
        if (!email) missingFields.push('email');
        if (!phone) missingFields.push('phone');
        
        if (missingFields.length > 0) {
            response.setStatusCode(400);
            response.setBody({ 
                success: false, 
                error: `Missing required fields: ${missingFields.join(', ')}` 
            });
            return callback(null, response);
        }

        // Generate random 6 digit order ID
        const orderId = Math.floor(100000 + Math.random() * 900000).toString();

        const newOrder = await base('orders').create({
            "id": orderId,
            "items": JSON.stringify(items),
            "total_amount": totalAmount,
            "shipping_status": "pending",
            "email": email,
            "phone": phone
        });
        
        response.setBody({
            success: true,
            data: {
                id: newOrder.id,
                order_id: orderId,
                items: JSON.parse(newOrder.fields.items),
                total_amount: newOrder.fields.total_amount,
                shipping_status: newOrder.fields.shipping_status,
                customer_id: newOrder.fields.customer_id,
                email: newOrder.fields.email,
                phone: newOrder.fields.phone
            }
        });
        
        return callback(null, response);
        
    } catch (error) {
        console.error('Error in create-order:', error);
        response.setStatusCode(500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Internal server error'
        });
        return callback(null, response);
    }
};