/**
 * Video Call Service
 * Handles integration with Zoom and Google Meet APIs
 * 
 * MOCK MODE: Currently returns mock links
 * PRODUCTION MODE: Connect to real APIs by updating the functions below
 */

// Configuration flags
const USE_REAL_ZOOM = false; // Set to true to use real Zoom API
const USE_REAL_GOOGLE_MEET = false; // Set to true to use real Google Meet API

/**
 * Generate Zoom Meeting Link
 * 
 * MOCK: Returns a fake Zoom link
 * PRODUCTION: Call Zoom API to create actual meeting
 * 
 * Setup for Production:
 * 1. Get Zoom OAuth credentials from https://marketplace.zoom.us/
 * 2. Install: npm install @zoom/meetingsdk
 * 3. Store credentials in environment variables
 * 4. Set USE_REAL_ZOOM = true
 */
export const generateZoomLink = async (eventDetails) => {
  if (USE_REAL_ZOOM) {
    try {
      // PRODUCTION CODE - Uncomment and configure when ready
      /*
      const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_ZOOM_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic: eventDetails.title,
          type: 2, // Scheduled meeting
          start_time: eventDetails.start_time,
          duration: Math.ceil((new Date(eventDetails.end_time) - new Date(eventDetails.start_time)) / 60000),
          timezone: 'UTC',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: false,
            watermark: false,
            audio: 'both',
            auto_recording: 'none'
          }
        })
      });
      
      const data = await response.json();
      return {
        success: true,
        meeting_url: data.join_url,
        meeting_id: data.id,
        password: data.password,
        host_url: data.start_url
      };
      */
      
      // Fallback to mock if API fails
      return generateMockZoomLink();
    } catch (error) {
      console.error('Zoom API Error:', error);
      return generateMockZoomLink();
    }
  } else {
    // MOCK MODE
    return generateMockZoomLink();
  }
};

/**
 * Generate Google Meet Link
 * 
 * MOCK: Returns a fake Google Meet link
 * PRODUCTION: Call Google Calendar API to create meeting with Meet link
 * 
 * Setup for Production:
 * 1. Get Google OAuth credentials from https://console.cloud.google.com/
 * 2. Enable Google Calendar API
 * 3. Install: npm install googleapis
 * 4. Store credentials in environment variables
 * 5. Set USE_REAL_GOOGLE_MEET = true
 */
export const generateGoogleMeetLink = async (eventDetails) => {
  if (USE_REAL_GOOGLE_MEET) {
    try {
      // PRODUCTION CODE - Uncomment and configure when ready
      /*
      const { google } = require('googleapis');
      const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
      
      const event = {
        summary: eventDetails.title,
        description: eventDetails.description,
        start: {
          dateTime: eventDetails.start_time,
          timeZone: 'UTC',
        },
        end: {
          dateTime: eventDetails.end_time,
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: Math.random().toString(36).substring(7),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 },
          ],
        },
      };
      
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
      });
      
      return {
        success: true,
        meeting_url: response.data.hangoutLink,
        event_id: response.data.id
      };
      */
      
      // Fallback to mock if API fails
      return generateMockGoogleMeetLink();
    } catch (error) {
      console.error('Google Meet API Error:', error);
      return generateMockGoogleMeetLink();
    }
  } else {
    // MOCK MODE
    return generateMockGoogleMeetLink();
  }
};

/**
 * Mock Zoom Link Generator
 * Generates realistic-looking Zoom links for testing
 */
const generateMockZoomLink = () => {
  const meetingId = Math.floor(100000000 + Math.random() * 900000000);
  const password = Math.random().toString(36).substring(2, 8);
  
  return {
    success: true,
    meeting_url: `https://zoom.us/j/${meetingId}?pwd=${password}`,
    meeting_id: meetingId.toString(),
    password: password,
    host_url: `https://zoom.us/s/${meetingId}?zak=mock_host_key`,
    is_mock: true
  };
};

/**
 * Mock Google Meet Link Generator
 * Generates realistic-looking Google Meet links for testing
 */
const generateMockGoogleMeetLink = () => {
  const code = Math.random().toString(36).substring(2, 12);
  
  return {
    success: true,
    meeting_url: `https://meet.google.com/${code}`,
    event_id: `mock_${Date.now()}`,
    is_mock: true
  };
};

/**
 * Get Video Call Service Status
 * Returns which services are using real APIs vs mock
 */
export const getServiceStatus = () => {
  return {
    zoom: {
      enabled: USE_REAL_ZOOM,
      mode: USE_REAL_ZOOM ? 'PRODUCTION' : 'MOCK'
    },
    google_meet: {
      enabled: USE_REAL_GOOGLE_MEET,
      mode: USE_REAL_GOOGLE_MEET ? 'PRODUCTION' : 'MOCK'
    }
  };
};

/**
 * Validate Video Call Credentials
 * Check if API credentials are configured
 */
export const validateCredentials = () => {
  return {
    zoom: {
      configured: !!process.env.REACT_APP_ZOOM_ACCESS_TOKEN,
      missing: !process.env.REACT_APP_ZOOM_ACCESS_TOKEN ? ['REACT_APP_ZOOM_ACCESS_TOKEN'] : []
    },
    google_meet: {
      configured: !!process.env.REACT_APP_GOOGLE_CLIENT_ID && !!process.env.REACT_APP_GOOGLE_CLIENT_SECRET,
      missing: [
        !process.env.REACT_APP_GOOGLE_CLIENT_ID && 'REACT_APP_GOOGLE_CLIENT_ID',
        !process.env.REACT_APP_GOOGLE_CLIENT_SECRET && 'REACT_APP_GOOGLE_CLIENT_SECRET'
      ].filter(Boolean)
    }
  };
};

export default {
  generateZoomLink,
  generateGoogleMeetLink,
  getServiceStatus,
  validateCredentials
};
