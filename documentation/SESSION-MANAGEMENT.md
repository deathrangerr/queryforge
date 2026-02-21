# Session Management

## Overview
The application implements comprehensive session management with security best practices.

## Features

### 1. Session Timeouts

**Maximum Session Age: 60 minutes**
- Sessions automatically expire after 60 minutes from login
- Cannot be extended beyond this limit
- User must re-authenticate after expiry

**Inactivity Timeout: 5 minutes (300 seconds)**
- Session expires after 5 minutes of no activity
- Activity includes: mouse clicks, keyboard input, scrolling, touch events
- Timer resets on any user interaction
- Automatic cleanup of database connections on timeout

### 2. Single Session Per User

**One Active Session Only**
- Users can only be logged in from one location at a time
- New login automatically terminates previous session
- Previous session's database connections are cleaned up
- Prevents concurrent access from multiple devices

### 3. Logout Functionality

**Manual Logout**
- Logout button in toolbar (🚪 Logout)
- Cleans up all resources:
  - Database connections closed
  - Session destroyed
  - Cookies cleared
  - User redirected to login

**Automatic Logout**
- On inactivity timeout
- On session expiry
- On concurrent login detection

## Implementation Details

### Server-Side

```javascript
// Session configuration
session({
  rolling: true,              // Reset expiry on activity
  cookie: {
    maxAge: 60 * 60 * 1000,  // 60 minutes
    httpOnly: true,           // Prevent XSS
    sameSite: 'lax'          // CSRF protection
  }
})

// Inactivity timeout: 5 minutes
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

// Single session enforcement
activeSessions.set(email, sessionID);
```

### Client-Side

```javascript
// Activity monitor
const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
events.forEach(event => {
  document.addEventListener(event, resetTimer);
});

// Auto-logout on inactivity
setTimeout(() => {
  handleLogout();
}, 5 * 60 * 1000);
```

## Security Benefits

✅ **Prevents session hijacking** - Short session lifetime  
✅ **Reduces attack window** - Inactivity timeout  
✅ **Prevents concurrent access** - Single session per user  
✅ **Proper cleanup** - Resources released on logout  
✅ **CSRF protection** - SameSite cookies  
✅ **XSS protection** - HttpOnly cookies  

## User Experience

### Normal Flow
1. User logs in via SAML
2. Session active for up to 60 minutes
3. Activity resets inactivity timer
4. User logs out manually

### Inactivity Flow
1. User inactive for 5 minutes
2. Notification: "Session expired due to inactivity"
3. Automatic logout
4. Redirect to login page

### Concurrent Login Flow
1. User logs in from Device A
2. User logs in from Device B
3. Device A session terminated automatically
4. Device B session becomes active

## Configuration

### Adjust Timeouts

**Server (`server.js`):**
```javascript
// Change inactivity timeout (default: 5 minutes)
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Change max session age (default: 60 minutes)
cookie: {
  maxAge: 120 * 60 * 1000 // 120 minutes
}
```

**Client (`App.jsx`):**
```javascript
// Change client-side inactivity timeout (should match server)
setTimeout(() => {
  handleLogout();
}, 10 * 60 * 1000); // 10 minutes
```

## Monitoring

### Server Logs
```
Session expired due to inactivity: user@example.com
```

### Client Notifications
- "Session expired due to inactivity" (error)
- "Logged out successfully" (info)
- "Logout failed" (error)

## Best Practices

✅ **Keep timeouts synchronized** - Client and server should match  
✅ **Test timeout behavior** - Verify cleanup works correctly  
✅ **Monitor session activity** - Check logs for unusual patterns  
✅ **Use HTTPS in production** - Secure cookie transmission  
✅ **Implement session storage** - Use Redis for production (see below)  

## Production Considerations

### Use Redis for Session Storage

For production with multiple servers, use Redis:

```javascript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  host: 'localhost',
  port: 6379
});

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  rolling: true,
  cookie: {
    maxAge: 60 * 60 * 1000,
    secure: true, // HTTPS only
    httpOnly: true,
    sameSite: 'strict'
  }
}));
```

### Environment Variables

```bash
SESSION_SECRET=your-secure-random-secret-here
SESSION_MAX_AGE=3600000  # 60 minutes in milliseconds
INACTIVITY_TIMEOUT=300000 # 5 minutes in milliseconds
```

## Troubleshooting

**Session expires too quickly:**
- Check `maxAge` in session config
- Verify `rolling: true` is set
- Check client-side activity monitor

**Multiple sessions allowed:**
- Verify `activeSessions` Map is working
- Check session middleware is applied
- Ensure sessionID is consistent

**Logout doesn't work:**
- Check database connection cleanup
- Verify session.destroy() is called
- Check cookie clearing

**Inactivity timeout not working:**
- Verify client-side event listeners
- Check server-side timeout logic
- Ensure timers are being reset

## Testing

### Test Inactivity Timeout
1. Login to application
2. Don't interact for 5 minutes
3. Should see "Session expired" notification
4. Should be redirected to login

### Test Concurrent Login
1. Login from Browser A
2. Login from Browser B with same user
3. Browser A should be logged out
4. Browser B should remain active

### Test Manual Logout
1. Login to application
2. Click "Logout" button
3. Should see "Logged out successfully"
4. Should be redirected to login
5. Database connections should be closed

## Metrics to Monitor

- Average session duration
- Inactivity timeout frequency
- Concurrent login attempts
- Failed logout attempts
- Active sessions count
