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
        
        const { firstName, lastName, email, phone, address, city, state, zipCode } = event;
        
        // Validate required fields
        if (!firstName || !lastName || !email || !phone) {
            response.setStatusCode(400);
            response.setBody({ 
                success: false, 
                error: 'Missing required fields' 
            });
            return callback(null, response);
        }

        // Check if customer exists
        const existingRecords = await base('customers').select({
            filterByFormula: `{email} = '${email}'`
        }).firstPage();
        
        let customer;
        if (existingRecords.length > 0) {
            customer = existingRecords[0];
        } else {
            // Create new customer
            customer = await base('customers').create({
                "first_name": firstName,
                "last_name": lastName,
                "email": email,
                "phone": phone,
                "address": address,
                "city": city,
                "state": state,
                "zip_code": zipCode
            });
        }
        
        response.setBody({
            success: true,
            data: {
                id: customer.id,
                first_name: customer.fields.first_name,
                last_name: customer.fields.last_name,
                email: customer.fields.email,
                phone: customer.fields.phone,
                address: customer.fields.address,
                city: customer.fields.city,
                state: customer.fields.state,
                zip_code: customer.fields.zip_code
            }
        });
        
        return callback(null, response);
        
    } catch (error) {
        console.error('Error in create-customer:', error);
        response.setStatusCode(500);
        response.setBody({ 
            success: false, 
            error: error.message || 'Internal server error'
        });
        return callback(null, response);
    }
};