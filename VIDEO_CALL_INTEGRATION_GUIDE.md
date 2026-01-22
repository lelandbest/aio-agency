# Video Call Integration Setup Guide

## Overview
The Calendar module supports automatic meeting link generation for Zoom and Google Meet. Currently running in **MOCK MODE** for testing. Follow this guide to connect to real APIs.

---

## 🎥 Zoom Integration

### Prerequisites
1. Zoom account with API access
2. Zoom OAuth App credentials

### Setup Steps

#### 1. Create Zoom OAuth App
1. Go to [Zoom Marketplace](https://marketplace.zoom.us/)
2. Click "Develop" → "Build App"
3. Choose "OAuth" app type
4. Fill in app details:
   - App Name: "AIO Agency Calendar"
   - App Type: "Account-level app"
   - Scopes needed: `meeting:write`, `meeting:read`
5. Get your credentials:
   - Client ID
   - Client Secret
   - Redirect URL: `https://your-domain.com/oauth/zoom/callback`

#### 2. Configure Environment Variables
Add to `/app/frontend/.env`:
```bash
REACT_APP_ZOOM_CLIENT_ID=your_client_id_here
REACT_APP_ZOOM_CLIENT_SECRET=your_client_secret_here
REACT_APP_ZOOM_ACCESS_TOKEN=your_access_token_here
```

#### 3. Install Zoom SDK (Optional)
```bash
cd /app/frontend
yarn add @zoom/meetingsdk
```

#### 4. Enable Production Mode
In `/app/frontend/src/services/videoCallService.js`:
```javascript
const USE_REAL_ZOOM = true; // Change to true
```

#### 5. Implement OAuth Flow
Uncomment the production code in `videoCallService.js` → `generateZoomLink()`

### API Reference
- [Zoom API Documentation](https://marketplace.zoom.us/docs/api-reference/zoom-api)
- [Create Meeting Endpoint](https://marketplace.zoom.us/docs/api-reference/zoom-api/methods/#operation/meetingCreate)

---

## 📹 Google Meet Integration

### Prerequisites
1. Google Cloud Project
2. Google Calendar API enabled
3. OAuth 2.0 credentials

### Setup Steps

#### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable APIs:
   - Google Calendar API
   - Google Meet API (if available)

#### 2. Create OAuth Credentials
1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: "Web application"
4. Add authorized redirect URIs:
   - `https://your-domain.com/oauth/google/callback`
5. Download JSON credentials

#### 3. Configure Environment Variables
Add to `/app/frontend/.env`:
```bash
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here
REACT_APP_GOOGLE_CLIENT_SECRET=your_client_secret_here
REACT_APP_GOOGLE_REDIRECT_URI=https://your-domain.com/oauth/google/callback
```

#### 4. Install Google APIs Client
```bash
cd /app/frontend
yarn add googleapis
```

#### 5. Enable Production Mode
In `/app/frontend/src/services/videoCallService.js`:
```javascript
const USE_REAL_GOOGLE_MEET = true; // Change to true
```

#### 6. Implement OAuth Flow
Uncomment the production code in `videoCallService.js` → `generateGoogleMeetLink()`

### API Reference
- [Google Calendar API](https://developers.google.com/calendar/api/guides/overview)
- [Create Events with Meet](https://developers.google.com/calendar/api/guides/create-events#conferencing)

---

## 🔧 Testing

### Mock Mode (Current)
- Click "Generate" button in event modal
- Mock links created instantly
- Links look realistic but are not functional

### Production Mode
- Real API calls made
- Functional meeting links generated
- Credentials validated
- Error handling included

---

## 🔐 Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all API keys
3. **Implement token refresh** for OAuth
4. **Store tokens encrypted** in database
5. **Use HTTPS** for all OAuth callbacks
6. **Rate limit** API calls
7. **Log API errors** for debugging

---

## 📊 Service Status

Check integration status programmatically:

```javascript
import { getServiceStatus, validateCredentials } from './services/videoCallService';

// Check which services are enabled
const status = getServiceStatus();
console.log(status);
// { zoom: { enabled: false, mode: 'MOCK' }, google_meet: { enabled: false, mode: 'MOCK' } }

// Validate credentials
const creds = validateCredentials();
console.log(creds);
// { zoom: { configured: false, missing: ['REACT_APP_ZOOM_ACCESS_TOKEN'] }, ... }
```

---

## 🐛 Troubleshooting

### Zoom Issues

**Problem:** "Invalid access token"
- **Solution:** Regenerate OAuth token, check expiration

**Problem:** "Meeting not created"
- **Solution:** Verify scopes include `meeting:write`

**Problem:** "User not found"
- **Solution:** Use correct user ID or email in API call

### Google Meet Issues

**Problem:** "403 Forbidden"
- **Solution:** Enable Google Calendar API in Cloud Console

**Problem:** "Conference data not created"
- **Solution:** Add `conferenceDataVersion: 1` to API call

**Problem:** "Invalid OAuth credentials"
- **Solution:** Regenerate credentials, check redirect URI

---

## 📝 Integration Flow

### User Experience
1. User creates event in Calendar
2. Selects "Zoom" or "Google Meet" as location type
3. Clicks "Generate" button
4. System creates meeting link automatically
5. Link saved with event
6. Guests receive meeting link in email/notification

### Technical Flow
1. `EventModal` → User clicks Generate
2. `generateMeetingLink()` → Calls video service
3. `videoCallService.js` → Makes API call (or returns mock)
4. Response includes meeting URL
5. URL stored in event data
6. Displayed in calendar views and booking confirmations

---

## 🚀 Migration Path

### Phase 1: Mock Mode (Current)
✅ UI complete
✅ Mock link generation working
✅ Service architecture ready

### Phase 2: Zoom Integration
- [ ] Get Zoom OAuth credentials
- [ ] Configure environment variables
- [ ] Enable production mode
- [ ] Test meeting creation
- [ ] Implement token refresh

### Phase 3: Google Meet Integration
- [ ] Set up Google Cloud Project
- [ ] Enable Calendar API
- [ ] Get OAuth credentials
- [ ] Configure environment variables
- [ ] Enable production mode
- [ ] Test meeting creation

### Phase 4: Production Ready
- [ ] Error handling enhanced
- [ ] Logging implemented
- [ ] Rate limiting added
- [ ] Token management system
- [ ] User notifications
- [ ] Analytics tracking

---

## 💡 Tips

- Start with Zoom (simpler OAuth flow)
- Test with sandbox/dev accounts first
- Monitor API usage/quotas
- Cache OAuth tokens securely
- Implement fallback to manual entry if API fails
- Add loading states for better UX
- Display meeting passwords when available
- Send calendar invites with meeting links

---

## 📞 Support

For integration issues:
- Zoom: https://devsupport.zoom.us/
- Google: https://developers.google.com/calendar/support

For code issues:
- Check `/app/frontend/src/services/videoCallService.js`
- Review browser console for errors
- Check network tab for API responses
