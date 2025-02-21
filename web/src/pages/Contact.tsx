import { Navigation } from "@/components/Navigation";
import { AssistantChat } from "@twilio-alpha/assistants-react";
import { useEffect, useState } from "react";
import { twilioApi } from "@/integrations/twilio";

const TWILIO_ASSISTANT_SID = import.meta.env.VITE_TWILIO_ASSISTANT_SID;
const AI_ASSISTANT_PHONE_NUMBER = import.meta.env.VITE_AI_ASSISTANT_PHONE_NUMBER;

const Contact = () => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        console.log('Fetching chat token...');
        const response = await twilioApi.chat.generateToken();
        
        // Log the entire response for debugging
        console.log('Response structure:', {
          success: response.success,
          hasData: !!response.data,
          hasToken: response.data?.token ? 'yes' : 'no',
          token: response.data?.token
        });
        
        // First check if the response was successful
        if (!response.success) {
          throw new Error(`API call failed: ${response.error}`);
        }

        // Then check if we have data
        if (!response.data) {
          throw new Error('Response missing data object');
        }

        // Finally check for the token
        const { token: chatToken } = response.data;
        if (!chatToken) {
          throw new Error('Token missing from response data');
        }

        console.log('Valid token received');
        setToken(chatToken);
      } catch (error) {
        console.error('Error initializing chat:', error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
      }
    };

    fetchToken();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
            <p className="text-xl text-gray-600">We're here to help!</p>
          </header>

          <div className="bg-white shadow-lg rounded-lg p-8 max-w-2xl mx-auto">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Business Hours</h2>
                <p className="text-gray-600">Monday - Friday: 9:00 AM - 5:00 PM PST</p>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Phone</h2>
                <p className="text-gray-600">{AI_ASSISTANT_PHONE_NUMBER}</p>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Email</h2>
                <p className="text-gray-600">support@owlshoes.com</p>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Location</h2>
                <p className="text-gray-600">123 Owl Street<br />San Francisco, CA 94105</p>
              </div>

              {error ? (
                <div className="text-red-600 p-4 rounded bg-red-50">
                  Error loading chat: {error}
                </div>
              ) : token && TWILIO_ASSISTANT_SID ? (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Live Chat</h2>
                  <div style={{ minHeight: '400px' }}>
                    <AssistantChat 
                      token={token}
                      assistantSid={TWILIO_ASSISTANT_SID}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-gray-600 p-4">
                  Loading chat...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;