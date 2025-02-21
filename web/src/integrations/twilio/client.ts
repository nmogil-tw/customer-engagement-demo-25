// src/integrations/twilio/client.ts

// Configuration for Twilio Functions
const TWILIO_FUNCTIONS_DOMAIN = import.meta.env.VITE_TWILIO_FUNCTION_URL || '';

// Helper function to construct URLs
const getFunctionUrl = (functionPath: string): string => {
  return `https://${TWILIO_FUNCTIONS_DOMAIN}/front-end/${functionPath}`;
};

// Types for API responses
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Common headers for all requests
const defaultHeaders = {
  'Content-Type': 'application/json',
};

// Generic fetch wrapper with error handling
async function fetchFromFunction<T>(
  functionPath: string, 
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  try {
    const url = getFunctionUrl(functionPath);
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    
    // Return the response data directly as it already has the correct structure
    return responseData;
  } catch (error) {
    console.error('Error fetching from Twilio Function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// API function exports
export const twilioApi = {
  // Customer related functions
  customers: {
    create: async (customerData: any) => {
      return fetchFromFunction('create-customer', {
        method: 'POST',
        body: JSON.stringify(customerData),
      });
    },
  },

  // Order related functions
  orders: {
    create: async (orderData: any) => {
      return fetchFromFunction('create-order', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
    },
    checkShippingStatus: async (orderId: string) => {
      return fetchFromFunction('check-shipping-status', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
    },
  },

  // Analytics functions
  analytics: {
    sendToSegment: async (data: any) => {
      return fetchFromFunction('send-to-segment', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  // Returns related functions
  returns: {
    process: async (returnData: any) => {
      return fetchFromFunction('process-return', {
        method: 'POST',
        body: JSON.stringify(returnData),
      });
    },
  },

  // Chat related functions
  chat: {
    generateToken: async () => {
      return fetchFromFunction<{ token: string }>('generate-chat-token', {
        method: 'POST',
      });
    },
  },
};

export type TwilioApi = typeof twilioApi;