const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorHandler_fixed');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const emailRoutes = require('./routes/emailRoutes');
const matchNotificationRoutes = require('./routes/matchNotificationRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const referralRoutes = require('./routes/referralRoutes');
const relationshipRoutes = require('./routes/relationshipRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const waliRoutes = require('./routes/waliRoutes');
const feedRoutes = require('./routes/feedRoutes');
const monthlyUsageRoutes = require('./routes/monthlyUsageRoutes');
const dashboardRoutes = require('./routes/dashboard');
const getstreamVideoCallRoutes = require('./routes/getstreamVideoCallRoutes');
const videoCallTimeRoutes = require('./routes/videoCallTime');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');
const VideoCallTime = require('./models/VideoCallTime');
const compression = require('compression');
const { trackRequestPerformance, performanceEndpoint, healthCheckEndpoint } = require('./middlewares/performanceMonitor');
const { createIndexes } = require('./config/indexes');
const { startScheduler } = require('./utils/emailScheduler');

// Load environment variables from the env file
dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://quluub-reborn-project-33.vercel.app',
    'https://preview--quluub-reborn-project-99.lovable.app',
    'https://love.quluub.com',
    'https://match.quluub.com'
  ],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Enable HTTP compression for faster API responses
app.use(compression({ level: 6 }));
app.use(express.json());


// SIMPLIFIED SOCKET.IO CONFIGURATION FOR DEVELOPMENT
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:3000',
      'https://quluub-reborn-project-33.vercel.app',
      'https://preview--quluub-reborn-project-99.lovable.app',
      'https://love.quluub.com',
      'https://match.quluub.com'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
  allowEIO3: true, // Allow Engine.IO v3 for better compatibility
  
  // Relaxed settings for development
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 10000, // 10 seconds
  
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 20000, // 20 seconds
  
  serveClient: false,
  cookie: false,
  
  // Allow all connections for development
  allowRequest: (req, callback) => {
    console.log('🔗 Socket.IO connection request from:', req.headers.origin);
    callback(null, true);
  }
});

let onlineUsers = new Map();
let sentWaliCallEmail = new Set();
// Track active calls by sessionId to compute duration server-side (legacy - removed for PeerJS)
// let activeCalls = new Map();

// Attach Socket.IO instance to Express app for route access
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Remove legacy WebRTC namespace (PeerJS/Daily) - GetStream uses main namespace only


// Socket authentication middleware for MAIN namespace (video calls, messages, etc.)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    console.log('🔐 Socket auth attempt:', socket.id, 'Token exists:', !!token);
    
    if (!token) {
      const debugUserId = `debug-${socket.id}`;
      socket.userId = debugUserId;
      socket.user = { _id: debugUserId, fname: `Debug-${socket.id.slice(-4)}` };
      console.log('🔐 Debug user created:', debugUserId);
      return next();
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.log('❌ User not found for token:', decoded.id);
        // Fall back to debug user instead of rejecting
        const debugUserId = `debug-${socket.id}`;
        socket.userId = debugUserId;
        socket.user = { _id: debugUserId, fname: `Debug-${socket.id.slice(-4)}` };
        return next();
      }

      socket.userId = user._id.toString();
      socket.user = user;
      console.log('✅ User authenticated:', user._id, user.fname);
      next();
    } catch (jwtError) {
      console.log('❌ JWT verification failed:', jwtError.message);
      // Fall back to debug user instead of rejecting
      const debugUserId = `debug-${socket.id}`;
      socket.userId = debugUserId;
      socket.user = { _id: debugUserId, fname: `Debug-${socket.id.slice(-4)}` };
      next();
    }
  } catch (error) {
    console.error('❌ Main namespace socket authentication error:', error.message);
    // Always allow connection with debug user
    const debugUserId = `debug-${socket.id}`;
    socket.userId = debugUserId;
    socket.user = { _id: debugUserId, fname: `Debug-${socket.id.slice(-4)}` };
    next();
  }
});

// Removed WebRTC namespace auth middleware

// Main namespace connection (for general app functionality)
io.on('connection', (socket) => {
  console.log('🔌 New socket connection:', socket.id, 'User:', socket.userId);
  console.log('🔌 Current online users before join:', Array.from(onlineUsers.keys()));
  
  socket.on('join', async (userId) => {
    const userIdStr = userId.toString();
    socket.join(userIdStr);
    onlineUsers.set(userIdStr, socket.id);
    
    // IMMEDIATE: Update user's online status in database with priority
    try {
      await User.findByIdAndUpdate(userIdStr, { 
        lastSeen: new Date(),
        isOnline: true 
      });
      console.log('✅ Database updated: User', userIdStr, 'marked as online');
    } catch (error) {
      console.error('❌ Error updating user online status:', error);
    }
    
    console.log('👤 User joined:', userIdStr, 'Socket:', socket.id);
    console.log('👥 Active users after join:', Array.from(onlineUsers.keys()));
    console.log('👥 Total online users:', onlineUsers.size);
    
    // IMMEDIATE: Broadcast updated online users list to all clients
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit('getOnlineUsers', onlineUsersList);
    
    // BROADCAST: Notify all clients that this user is now online
    socket.broadcast.emit('user-came-online', { userId: userIdStr, timestamp: new Date().toISOString() });
  });
  
  // Add listener for joinNotifications event as well
  socket.on('joinNotifications', (userId) => {
    socket.join(`notifications_${userId}`);
  });

  // Handle explicit user online status updates from frontend
  socket.on('user-online-status', async (data) => {
    const { userId, isOnline } = data;
    if (!userId) return;
    
    const userIdStr = userId.toString();
    
    if (isOnline) {
      // Only update if user wasn't already online (prevent duplicate broadcasts)
      const wasAlreadyOnline = onlineUsers.has(userIdStr);
      
      if (!wasAlreadyOnline) {
        onlineUsers.set(userIdStr, socket.id);
        
        // Update database immediately
        try {
          await User.findByIdAndUpdate(userIdStr, { 
            lastSeen: new Date(),
            isOnline: true 
          });
          console.log('✅ Explicit online status update: User', userIdStr, 'marked as online');
        } catch (error) {
          console.error('❌ Error in explicit online status update:', error);
        }
        
        // Only broadcast if user wasn't already online
        const onlineUsersList = Array.from(onlineUsers.keys());
        io.emit('getOnlineUsers', onlineUsersList);
        
        // Notify all clients that this user is now online (only once)
        socket.broadcast.emit('user-came-online', { userId: userIdStr, timestamp: new Date().toISOString() });
      }
    }
  });

  // CONVERSATION ROOM MANAGEMENT
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
  });

  // VIDEO CALL NOTIFICATION SYSTEM - REMOVED
  // This is now handled by /api/peerjs-video-call/initiate endpoint
  // to prevent duplicate notification systems and ensure single source of truth

  // Handle call rejection
  // Removed legacy reject-video-call handler (PeerJS/Daily)

  // Removed legacy cancel-video-call handler (PeerJS/Daily)

  // ===== GetStream session join (accept call) =====
  socket.on('getstream-session-join', async (data) => {
    try {
      const { sessionId, participantId, participantName, hostId } = data || {};
      if (!sessionId || !hostId || !participantId) return;

      // Notify host/caller that participant accepted
      const hostSocketId = onlineUsers.get(hostId?.toString());
      const payload = { sessionId, recipientId: participantId, recipientName: participantName };
      if (hostSocketId) io.to(hostSocketId).emit('getstream_call_accepted', payload);
      io.to(hostId?.toString()).emit('getstream_call_accepted', payload);

      // Clear any pending professional session notifications
      try {
        const Notification = require('./models/Notification');
        Notification.deleteMany({
          type: 'getstream_video_call_invitation',
          'data.sessionId': sessionId
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.warn('getstream-session-join handler error:', e?.message || e);
    }
  });

  // ===== GetStream call end =====
  socket.on('getstream-video-call-end', async (data) => {
    try {
      const { sessionId, callerId, recipientId } = data || {};
      if (!sessionId || !callerId || !recipientId) return;

      const participants = [callerId.toString(), recipientId.toString()];
      const notified = new Set();

      participants.forEach(pid => {
        const sid = onlineUsers.get(pid);
        const payload = { sessionId };
        if (sid && !notified.has(sid)) {
          io.to(sid).emit('getstream_call_ended', payload);
          notified.add(sid);
        }
        if (!sid) io.to(pid).emit('getstream_call_ended', payload);
      });

      // Best-effort: clear notifications for this session
      try {
        const Notification = require('./models/Notification');
        Notification.deleteMany({
          type: 'getstream_video_call_invitation',
          'data.sessionId': sessionId
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.warn('getstream-video-call-end handler error:', e?.message || e);
    }
  });

  // Removed PeerJS 'peer-call-ended' handler


  // ===== GetStream decline/cancel =====
  socket.on('getstream-video-call-reject', (data) => {
    try {
      const { sessionId, callerId, recipientId } = data || {};
      if (!sessionId || !callerId || !recipientId) return;
      const sid = onlineUsers.get(callerId.toString());
      const payload = { sessionId, recipientId };
      if (sid) io.to(sid).emit('getstream_call_rejected', payload);
      io.to(callerId.toString()).emit('getstream_call_rejected', payload);
    } catch {}
  });
  socket.on('getstream-video-call-cancel', (data) => {
    try {
      const { sessionId, recipientId } = data || {};
      if (!sessionId || !recipientId) return;
      const sid = onlineUsers.get(recipientId.toString());
      const payload = { sessionId };
      if (sid) io.to(sid).emit('getstream_call_cancelled', payload);
      io.to(recipientId.toString()).emit('getstream_call_cancelled', payload);
    } catch {}
  });


  socket.on('disconnect', () => {
    
    // Find the user associated with the disconnected socket
    const userId = [...onlineUsers.entries()]
      .find(([key, value]) => value === socket.id)?.[0];

    // If a user is found, remove them from the online users map
    if (userId) {
      onlineUsers.delete(userId);
      // Broadcast the updated list of online users to all clients
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    }
  });

  // ===== GETSTREAM PROFESSIONAL SESSION SOCKET HANDLERS =====
  
  // Modern session-based handlers (fresh approach)
  
  // Handle GetStream professional session join
  socket.on('getstream-session-join', async (data) => {
    const { sessionId, participantId, participantName, hostId, joinTimestamp, sessionType } = data;
    console.log('🎬 GetStream professional session join:', { 
      sessionId, participantId, participantName, hostId, sessionType 
    });

    // Notify host that participant joined the session
    const hostSocketId = onlineUsers.get(hostId?.toString());
    if (hostSocketId) {
      io.to(hostSocketId).emit('getstream_session_participant_joined', {
        sessionId,
        participantId,
        participantName,
        joinTimestamp,
        sessionType,
        message: `${participantName} joined the professional session`
      });
      console.log(`✨ Session join notification sent to host: ${hostId}`);
    }

    // Also send to host's room as backup
    io.to(hostId?.toString()).emit('getstream_session_participant_joined', {
      sessionId,
      participantId,
      participantName,
      joinTimestamp,
      sessionType
    });

    // Clear session invitation notifications
    try {
      const Notification = require('./models/Notification');
      await Notification.deleteMany({
        type: 'getstream_video_session_invitation',
        'data.sessionId': sessionId
      });
      console.log('✅ GetStream session notifications cleared for session:', sessionId);
    } catch (error) {
      console.error('❌ Error clearing GetStream session notifications:', error);
    }
  });

  // Legacy GetStream handlers (for backward compatibility)
  
  // Handle GetStream video call invitation
  socket.on('getstream-video-call-invitation', async (data) => {
    const { recipientId, sessionId, callerId, callerName, callId } = data;
    console.log('📞 GetStream video call invitation:', { recipientId, sessionId, callerId, callerName, callId });

    try {
      const VideoCallTime = require('./models/VideoCallTime');
      const record = await VideoCallTime.getOrCreatePairRecord(callerId, recipientId);
      const canCall = record.canMakeVideoCall();
      if (!canCall) {
        const callerSocketId = onlineUsers.get(callerId?.toString());
        const payload = { sessionId, recipientId, reason: 'limit_exceeded', timestamp: new Date().toISOString() };
        if (callerSocketId) io.to(callerSocketId).emit('getstream_call_rejected', payload);
        io.to(callerId?.toString()).emit('getstream_call_rejected', payload);
        return;
      }
    } catch (e) {
      console.warn('VideoCallTime check failed in invitation handler:', e?.message || e);
    }

    // Send to recipient's socket directly
    const recipientSocketId = onlineUsers.get(recipientId?.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('getstream_video_call_invitation', {
        callerId,
        callerName,
        sessionId,
        callId,
        timestamp: new Date().toISOString()
      });
      console.log('✅ GetStream invitation sent to recipient socket:', recipientSocketId);
    }

    // Also send to recipient's room as backup
    io.to(recipientId?.toString()).emit('getstream_video_call_invitation', {
      callerId,
      callerName,
      sessionId,
      callId,
      timestamp: new Date().toISOString()
    });
    console.log('✅ GetStream invitation sent to recipient room:', recipientId);
  });

  // Handle GetStream video call acceptance
  socket.on('getstream-video-call-accept', async (data) => {
    const { sessionId, callerId, recipientId, callId } = data;
    console.log('✅ GetStream video call accepted:', { sessionId, callerId, recipientId, callId });

    // Notify caller that call was accepted
    const callerSocketId = onlineUsers.get(callerId?.toString());
    if (callerSocketId) {
      io.to(callerSocketId).emit('getstream_call_accepted', {
        sessionId,
        recipientId,
        callId,
        timestamp: new Date().toISOString()
      });
      console.log('✅ GetStream acceptance sent to caller socket:', callerSocketId);
    }

    // Also send to caller's room as backup
    io.to(callerId?.toString()).emit('getstream_call_accepted', {
      sessionId,
      recipientId,
      callId,
      timestamp: new Date().toISOString()
    });
    console.log('✅ GetStream acceptance sent to caller room:', callerId);
  });

  // Handle GetStream video call rejection
  socket.on('getstream-video-call-reject', async (data) => {
    const { sessionId, callerId, recipientId, reason } = data;
    console.log('❌ GetStream video call rejected:', { sessionId, callerId, recipientId, reason });

    // Notify caller that call was rejected
    const callerSocketId = onlineUsers.get(callerId?.toString());
    if (callerSocketId) {
      io.to(callerSocketId).emit('getstream_call_rejected', {
        sessionId,
        recipientId,
        reason: reason || 'declined',
        timestamp: new Date().toISOString()
      });
      console.log('✅ GetStream rejection sent to caller socket:', callerSocketId);
    }

    // Also send to caller's room as backup
    io.to(callerId?.toString()).emit('getstream_call_rejected', {
      sessionId,
      recipientId,
      reason: reason || 'declined',
      timestamp: new Date().toISOString()
    });
    console.log('✅ GetStream rejection sent to caller room:', callerId);

    // Clear notifications
    try {
      const Notification = require('./models/Notification');
      await Notification.deleteMany({
        type: 'getstream_video_call_invitation',
        'data.sessionId': sessionId
      });
      console.log('✅ GetStream notifications cleared for session:', sessionId);
    } catch (error) {
      console.error('❌ Error clearing GetStream notifications:', error);
    }
  });

  // Handle GetStream video call end
  socket.on('getstream-video-call-end', async (data) => {
    const { sessionId, callerId, recipientId, duration } = data;
    console.log('📴 GetStream video call ended:', { sessionId, callerId, recipientId, duration });

    // Notify both participants that call ended
    const callerSocketId = onlineUsers.get(callerId?.toString());
    const recipientSocketId = onlineUsers.get(recipientId?.toString());

    const endPayload = {
      sessionId,
      callerId,
      recipientId,
      duration,
      timestamp: new Date().toISOString()
    };

    // Send to both participants via direct socket
    if (callerSocketId) {
      io.to(callerSocketId).emit('getstream_call_ended', endPayload);
    }
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('getstream_call_ended', endPayload);
    }

    // Send to both participants via room as backup
    io.to(callerId?.toString()).emit('getstream_call_ended', endPayload);
    io.to(recipientId?.toString()).emit('getstream_call_ended', endPayload);

    console.log('✅ GetStream call end notifications sent to both participants');

    if (false && duration && callerId && recipientId) {
    }

    try {
      if (sessionId && !sentWaliCallEmail.has(sessionId)) {
        sentWaliCallEmail.add(sessionId);

        const { sendEmail } = require('./utils/emailService');
        const waliVideoCallParticipationEmail = require('./utils/emailTemplates/waliVideoCallParticipation');

        const [callerUser, recipientUser] = await Promise.all([
          User.findById(callerId).select('fname lname gender waliDetails'),
          User.findById(recipientId).select('fname lname gender waliDetails')
        ]);

        if (callerUser || recipientUser) {
          const wardUser = (recipientUser && recipientUser.gender === 'female')
            ? recipientUser
            : (callerUser && callerUser.gender === 'female')
              ? callerUser
              : null;
          const otherUser = wardUser && callerUser && wardUser._id.toString() === callerUser._id.toString() ? recipientUser : callerUser;

          if (wardUser) {
            let waliEmail = '';
            let waliName = '';
            try {
              if (wardUser.waliDetails) {
                const wd = JSON.parse(wardUser.waliDetails);
                waliEmail = wd?.email || wd?.waliEmail || wd?.wali_email || wd?.guardianEmail || wd?.parentEmail || wd?.emailAddress || '';
                waliName = wd?.name || wd?.fullName || wd?.waliName || '';
              }
            } catch (e) {
              console.warn('⚠️ Failed to parse waliDetails JSON for user:', wardUser._id?.toString());
            }

            if (waliEmail) {
              const waliFirstName = (waliName || '').trim().split(' ')[0] || 'Guardian';
              const wardName = `${wardUser.fname || ''} ${wardUser.lname || ''}`.trim();
              const brotherName = otherUser ? `${otherUser.fname || ''} ${otherUser.lname || ''}`.trim() : 'A member';

              try {
                const waliEmailsEnabled = process.env.WALI_VIDEO_EMAILS_ENABLED !== 'false';
                const blocklist = (process.env.WALI_VIDEO_EMAILS_BLOCKLIST || '')
                  .split(',')
                  .map(e => e.trim().toLowerCase())
                  .filter(Boolean);
                const isBlocked = blocklist.includes(waliEmail.toLowerCase());

                if (!waliEmailsEnabled) {
                  console.log('✋ Wali participation emails disabled via WALI_VIDEO_EMAILS_ENABLED=false');
                } else if (isBlocked) {
                  console.log(`✋ Suppressing Wali participation email for blocklisted address: ${waliEmail}`);
                } else {
                  await sendEmail({
                    ...waliVideoCallParticipationEmail(waliFirstName, wardName, brotherName, 'mailto:support@quluub.com'),
                    to: waliEmail
                  });
                  console.log('✅ Wali participation email sent for session:', sessionId, 'to:', waliEmail);
                }
              } catch (emailErr) {
                console.error('❌ Failed to send Wali participation email:', emailErr?.message || emailErr);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('❌ Error while preparing/sending Wali participation email:', e?.message || e);
    }

    // Clear notifications
    try {
      const Notification = require('./models/Notification');
      await Notification.deleteMany({
        type: 'getstream_video_call_invitation',
        'data.sessionId': sessionId
      });
      console.log('✅ GetStream notifications cleared for session:', sessionId);
    } catch (error) {
      console.error('❌ Error clearing GetStream notifications:', error);
    }
  });

  // Handle GetStream video call cancellation
  socket.on('getstream-video-call-cancel', async (data) => {
    const { sessionId, callerId, recipientId } = data;
    console.log('🚫 GetStream video call cancelled:', { sessionId, callerId, recipientId });

    // Notify recipient that call was cancelled
    const recipientSocketId = onlineUsers.get(recipientId?.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('getstream_call_cancelled', {
        sessionId,
        callerId,
        timestamp: new Date().toISOString()
      });
      console.log('✅ GetStream cancellation sent to recipient socket:', recipientSocketId);
    }

    // Also send to recipient's room as backup
    io.to(recipientId?.toString()).emit('getstream_call_cancelled', {
      sessionId,
      callerId,
      timestamp: new Date().toISOString()
    });
    console.log('✅ GetStream cancellation sent to recipient room:', recipientId);

    // Clear notifications
    try {
      const Notification = require('./models/Notification');
      await Notification.deleteMany({
        type: 'getstream_video_call_invitation',
        'data.sessionId': sessionId
      });
      console.log('✅ GetStream notifications cleared for session:', sessionId);
    } catch (error) {
      console.error('❌ Error clearing GetStream notifications:', error);
    }
  });

});
// Removed legacy WebRTC namespace connection block (PeerJS/Daily)

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Health and performance monitoring endpoints
app.get('/health', healthCheckEndpoint);
app.get('/api/performance', performanceEndpoint);

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/admin/match-notifications', matchNotificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/relationships', relationshipRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wali', waliRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/monthly-usage', monthlyUsageRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/getstream-video-call', getstreamVideoCallRoutes);
app.use('/api/video-call-time', videoCallTimeRoutes);

// Set user as online (called when user makes any API request)
const { protect } = require('./middlewares/authMiddleware');
app.post('/api/user/set-online', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const User = require('./models/User');
    
    // Update user's last seen timestamp
    await User.findByIdAndUpdate(userId, {
      lastSeen: new Date(),
      isOnline: true
    });
    
    // Add to online users map
    onlineUsers.set(userId, 'api-connection');
    
    
    // Broadcast updated online users
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    
    res.json({ success: true, message: 'User marked as online' });
  } catch (error) {
    console.error('Error setting user online:', error);
    res.status(500).json({ error: 'Failed to set user online' });
  }
});

// Get online users (checks both socket connections and recent API activity)
app.get('/api/users/online', async (req, res) => {
  try {
    const User = require('./models/User');
    
    // Get users who were active in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentlyActiveUsers = await User.find({
      lastSeen: { $gte: fiveMinutesAgo }
    }).select('_id fname lname username lastSeen isOnline');
    
    // Combine socket-connected users with recently active users
    const socketUsers = Array.from(onlineUsers.keys());
    const apiUsers = recentlyActiveUsers.map(user => user._id.toString());
    
    // Create unique list of online users
    const allOnlineUsers = [...new Set([...socketUsers, ...apiUsers])];
    
    
    res.json({
      totalOnline: allOnlineUsers.length,
      onlineUsers: allOnlineUsers,
      recentlyActive: recentlyActiveUsers,
      socketConnected: socketUsers
    });
  } catch (error) {
    console.error('Error getting online users:', error);
    res.status(500).json({ error: 'Failed to get online users' });
  }
});

// Debug route for checking online users with detailed information
app.get('/api/debug/online-users', async (req, res) => {
  console.log('🔍 DEBUG ENDPOINT CALLED - Current state:');
  console.log('📊 Online users map:', Array.from(onlineUsers.entries()));
  // WebRTC users removed
  
  // Get recently active users from database
  let recentlyActiveUsers = [];
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const dbUsers = await User.find({
      lastSeen: { $gte: fiveMinutesAgo }
    }).select('_id fname lname username lastSeen isOnline');
    recentlyActiveUsers = dbUsers;
    console.log('💾 Recently active users from DB:', dbUsers.map(u => ({ id: u._id, name: `${u.fname} ${u.lname}`, lastSeen: u.lastSeen })));
  } catch (error) {
    console.error('❌ Error fetching recently active users:', error);
  }
  
  // Get all socket rooms
  const mainRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(room => !room.startsWith('notifications_'));
  
  console.log('🏠 Main namespace rooms:', mainRooms);
  // WebRTC namespace removed
  
  res.json({
    onlineUsers: Array.from(onlineUsers.keys()),
    onlineUsersCount: onlineUsers.size,
    onlineUsersMap: Object.fromEntries(onlineUsers),
    recentlyActiveUsers: recentlyActiveUsers.map(u => ({
      id: u._id,
      name: `${u.fname} ${u.lname}`,
      username: u.username,
      lastSeen: u.lastSeen,
      isOnline: u.isOnline
    })),
    mainRooms,
    timestamp: new Date().toISOString()
  });
});

// Force broadcast online users
app.get('/api/debug/broadcast-online-users', (req, res) => {
  io.emit('getOnlineUsers', onlineUsersList);
  
  res.json({
    message: 'Broadcasted online users',
    totalOnline: onlineUsers.size,
    onlineUsers: onlineUsersList
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Add Socket.IO error handling
io.engine.on("connection_error", (err) => {
  console.error('❌ Socket.IO connection error:', err.req);
  console.error('❌ Error code:', err.code);
  console.error('❌ Error message:', err.message);
  console.error('❌ Error context:', err.context);
});

server.listen(PORT, async () => {
  
  // Start email scheduler for automated notifications
  startScheduler();
  
  // Log online users count every 30 seconds for monitoring
  
  // Create database indexes for optimal performance after MongoDB connects
  mongoose.connection.once('connected', async () => {
    setTimeout(async () => {
      await createIndexes();
    }, 1000);
  });
});
