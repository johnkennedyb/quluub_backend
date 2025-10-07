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
const peerjsRoutes = require('./routes/peerjsRoutes');
const videoRecordingRoutes = require('./routes/videoRecordingRoutes');
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
dotenv.config({ path: './env (1)' });

connectDB();

const { ExpressPeerServer } = require('peer');
const app = express();
const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, {
  debug: process.env.NODE_ENV !== 'production',
  path: '/',
  allow_discovery: true,
  proxied: true,
  cors: {
    origin: [
      'https://quluub-reborn-project-33.vercel.app',
      'http://localhost:8080',
      'http://localhost:5173',
      'https://preview--quluub-reborn-project-99.lovable.app',
      'https://love.quluub.com',
      'https://match.quluub.com', // Added production frontend

    ],
    credentials: true
  },
  iceServers: [
    // Multiple Google STUN servers for better reliability
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Additional reliable STUN servers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voiparound.com' },
    { urls: 'stun:stun.voipbuster.com' },
    
    // Free TURN servers (fallback)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    
    // Custom TURN server if configured
    ...(process.env.TURN_URL ? [{
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    }] : [])
  ]
});

app.use('/peerjs', peerServer);

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

// Initialize user tracking maps
let onlineUsers = new Map();
let webrtcUsers = new Map();
// Track active calls by sessionId to compute duration server-side
let activeCalls = new Map();

// Attach Socket.IO instance to Express app for route access
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Create WebRTC namespace for video call functionality
const webrtcNamespace = io.of('/webrtc');
app.set('webrtcNamespace', webrtcNamespace);
app.set('webrtcUsers', webrtcUsers);


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

// Socket.IO authentication middleware for WebRTC namespace
webrtcNamespace.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    console.error('❌ WebRTC namespace socket authentication error:', error.message);
    next(new Error('Authentication error'));
  }
});

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
      // Add to online users if not already there
      if (!onlineUsers.has(userIdStr)) {
        onlineUsers.set(userIdStr, socket.id);
      }
      
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
      
      // Broadcast updated online users list
      const onlineUsersList = Array.from(onlineUsers.keys());
      io.emit('getOnlineUsers', onlineUsersList);
      
      // Notify all clients that this user is now online
      socket.broadcast.emit('user-came-online', { userId: userIdStr, timestamp: new Date().toISOString() });
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
  socket.on('reject-video-call', (data) => {
    const { sessionId, callerId, reason } = data;
    
    // Notify caller that call was rejected
    const callerSocketId = onlineUsers.get(callerId.toString());
    if (callerSocketId) {
      io.to(callerSocketId).emit('video_call_rejected', {
        sessionId,
        reason,
        message: reason === 'busy' ? 'User is currently busy' : 'Call was declined'
      });
      // Emit call status update for activity feed
      io.to(callerSocketId).emit('call-status-update', {
        sessionId,
        status: 'declined',
        callerId: callerId,
        otherUserName: data.recipientName || 'Unknown',
        otherUserUsername: data.recipientUsername || 'Unknown'
      });
    }
    
    // Also send to caller's room
    io.to(callerId.toString()).emit('video_call_rejected', {
      sessionId,
      reason,
      message: reason === 'busy' ? 'User is currently busy' : 'Call was declined'
    });
    // Emit call status update for activity feed
    io.to(callerId.toString()).emit('call-status-update', {
      sessionId,
      status: 'declined',
      callerId: callerId,
      otherUserName: data.recipientName || 'Unknown',
      otherUserUsername: data.recipientUsername || 'Unknown'
    });

    // Clear any pending invitation notifications for this session on reject
    try {
      const Notification = require('./models/Notification');
      Notification.deleteMany({
        type: 'video_call_invitation',
        relatedId: sessionId
      }).catch(() => {});
    } catch (e) {
      console.warn('⚠️ Failed to clear notifications on reject-video-call:', e?.message || e);
    }
  });

  // Handle call cancellation
  socket.on('cancel-video-call', (data) => {
    const { sessionId, callerId, recipientId } = data;
    
    // Notify recipient that call was canceled
    const recipientSocketId = onlineUsers.get(recipientId.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('video_call_canceled', {
        sessionId,
        callerId
      });
    }
    
    // Also send to recipient's room as a backup
    io.to(recipientId.toString()).emit('video_call_canceled', {
      sessionId,
      callerId
    });

    // Clear any pending invitation notifications for this session
    try {
      const Notification = require('./models/Notification');
      Notification.deleteMany({
        type: 'video_call_invitation',
        relatedId: sessionId
      }).catch(() => {});
    } catch (e) {
      console.warn('⚠️ Failed to clear notifications on cancel-video-call:', e?.message || e);
    }
  });

  // Handle call acceptance - unified handler for both event names
  socket.on('accept-call', async (data) => {
    const { sessionId, recipientId, recipientName, callerId } = data;
    console.log('📞 Call accepted by recipient:', { sessionId, recipientId, callerId });
    console.log('📞 Current online users:', Array.from(onlineUsers.keys()));
    const startAt = new Date().toISOString();
    const serverNowMs = Date.now();
    let remainingAtStart = 300;
    
    // Enhanced logging for video call time tracking
    console.log('⏱️ Checking video call time limit for pair:', { callerId, recipientId });
    
    try {
      const VideoCallTime = require('./models/VideoCallTime');
      const record = await VideoCallTime.getOrCreatePairRecord(callerId, recipientId);
      remainingAtStart = record.getRemainingTime();
      console.log('⏱️ Remaining time at call start:', remainingAtStart, 'seconds');
    } catch (e) {
      console.warn('⚠️ Failed to compute remainingAtStart:', e?.message || e);
    }

    // More lenient time limit check: only block if significantly exceeded (allow some grace)
    if (remainingAtStart < -30) { // Allow 30 seconds grace period
      console.log('🚫 Video call time limit significantly exceeded for pair:', { callerId, recipientId, remainingAtStart });
      const payload = { sessionId, remainingAtStart: 0, message: 'Video call time limit exceeded for this match' };
      const callerSocketId = onlineUsers.get(callerId?.toString());
      const recipientSocketId = onlineUsers.get(recipientId?.toString());
      if (callerSocketId) io.to(callerSocketId).emit('video_call_time_exceeded', payload);
      if (recipientSocketId) io.to(recipientSocketId).emit('video_call_time_exceeded', payload);
      io.to(callerId?.toString()).emit('video_call_time_exceeded', payload);
      io.to(recipientId?.toString()).emit('video_call_time_exceeded', payload);
      return; // Do not proceed with acceptance
    } else if (remainingAtStart <= 0) {
      console.log('⚠️ Video call time limit reached but allowing call with grace period:', { callerId, recipientId, remainingAtStart });
      remainingAtStart = Math.max(30, remainingAtStart); // Give at least 30 seconds
    }
    
    // LAYER 1: Notify caller via direct socket ID from onlineUsers map
    const callerSocketId = onlineUsers.get(callerId?.toString());
    if (callerSocketId) {
      io.to(callerSocketId).emit('call_accepted', {
        sessionId,
        recipientId,
        recipientName,
        callerId
      });
      console.log('✅ Layer 1: Notified caller via socket ID:', callerSocketId);

      // Also send synchronized start to caller via direct socket
      io.to(callerSocketId).emit('call_started', {
        sessionId,
        startAt,
        remainingAtStart,
        callerId,
        recipientId,
        serverNowMs
      });
    } else {
      console.warn('⚠️ Caller socket ID not found in onlineUsers map');
    }
    
    // LAYER 2: Send to caller's room as backup
    io.to(callerId?.toString()).emit('call_accepted', {
      sessionId,
      recipientId,
      recipientName,
      callerId
    });
    console.log('✅ Layer 2: Notified caller via room:', callerId);

    // As backup, send start event to caller's room
    io.to(callerId?.toString()).emit('call_started', {
      sessionId,
      startAt,
      remainingAtStart,
      callerId,
      recipientId,
      serverNowMs
    });
    
    // LAYER 3: Broadcast to all sockets (will be filtered client-side by sessionId)
    io.emit('call_accepted', {
      sessionId,
      recipientId,
      recipientName,
      callerId
    });
    console.log('✅ Layer 3: Broadcast call_accepted to all clients');

    // Notify recipient as well (direct + room) with call_started
    const recipientSocketId = onlineUsers.get(recipientId?.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call_started', { sessionId, startAt, remainingAtStart, callerId, recipientId, serverNowMs });
    }
    io.to(recipientId?.toString()).emit('call_started', { sessionId, startAt, remainingAtStart, callerId, recipientId, serverNowMs });

    // Record server-side start time for accurate duration computation
    try {
      activeCalls.set(sessionId, {
        callerId: callerId?.toString(),
        recipientId: recipientId?.toString(),
        startAtMs: Date.parse(startAt),
        remainingAtStart
      });
    } catch (e) {
      console.warn('⚠️ Failed to store active call session:', e?.message || e);
    }

    // Clear any pending invitation notifications for this session on accept
    try {
      const Notification = require('./models/Notification');
      Notification.deleteMany({
        type: 'video_call_invitation',
        relatedId: sessionId
      }).catch(() => {});
    } catch (e) {
      console.warn('⚠️ Failed to clear notifications on accept-call:', e?.message || e);
    }
  });

  // Legacy handler for backward compatibility
  socket.on('accept-video-call', (data) => {
    io.to(data.callerId).emit('video-call-accepted', {
      callerId: data.callerId,
      recipientId: data.recipientId,
      sessionId: data.sessionId
    });
  });

  // Handle call termination - broadcast to both participants (with ack)
  socket.on('end-video-call', async (data, ack) => {
    const { sessionId, userId, participantId, duration } = data;
    
    try {
      const VideoCallTime = require('./models/VideoCallTime');
      const videoCallRecord = await VideoCallTime.getOrCreatePairRecord(userId, participantId);
      
      // Enhanced logging for debugging
      console.log('⏱️ Ending video call with data:', data);
      console.log('⏱️ Current video call record:', {
        totalTimeSpent: videoCallRecord.totalTimeSpent,
        maxAllowedTime: videoCallRecord.maxAllowedTime,
        limitExceeded: videoCallRecord.limitExceeded,
        remainingTime: videoCallRecord.getRemainingTime()
      });
      
      // Compute server-side duration when possible
      let serverMeasured = 0;
      const active = sessionId ? activeCalls.get(sessionId) : null;
      if (active && active.startAtMs) {
        serverMeasured = Math.max(0, Math.floor((Date.now() - active.startAtMs) / 1000));
        activeCalls.delete(sessionId);
      }
      const clientDuration = typeof duration === 'number' ? duration : 0;
      // Use the longest credible duration
      let finalDuration = Math.max(clientDuration, serverMeasured);
      
      // Cap to remaining time so we don't exceed the 5-minute budget
      const remainingBefore = videoCallRecord.getRemainingTime();
      if (finalDuration > remainingBefore) finalDuration = remainingBefore;
      
      // Enhanced time tracking with validation
      if (finalDuration > 0) {
        const session = videoCallRecord.addCallTime(finalDuration, 'video');
        await videoCallRecord.save();
        console.log('✅ Tracked video call time:', { 
          sessionId, 
          finalDuration, 
          remainingAfter: videoCallRecord.getRemainingTime(),
          limitExceeded: videoCallRecord.limitExceeded
        });
        
        // If the limit has been exceeded, notify both participants
        if (videoCallRecord.limitExceeded) {
          console.log('🚫 Video call time limit exceeded for pair:', { userId, participantId });
          const participants = [userId.toString(), participantId.toString()];
          participants.forEach(participantId => {
            const participantSocketId = onlineUsers.get(participantId);
            const payload = { 
              sessionId, 
              remainingAtStart: 0, 
              message: 'Video call time limit exceeded for this match. No more video calls allowed.' 
            };
            
            if (participantSocketId) {
              io.to(participantSocketId).emit('video_call_time_exceeded', payload);
            }
            
            // Also send to room as backup
            io.to(participantId).emit('video_call_time_exceeded', payload);
          });
        }
      } else {
        console.log('ℹ️ No call duration to track (finalDuration=0).', { sessionId, clientDuration, serverMeasured });
      }
      
      // Broadcast call end to both participants (avoid duplicates)
      const participants = [userId.toString(), participantId.toString()];
      const notifiedSockets = new Set();
      
      participants.forEach(participantId => {
        const participantSocketId = onlineUsers.get(participantId);
        if (participantSocketId && !notifiedSockets.has(participantSocketId)) {
          io.to(participantSocketId).emit('video_call_ended', {
            sessionId,
            endedBy: userId,
            timestamp: new Date().toISOString(),
            totalTimeSpent: videoCallRecord.totalTimeSpent,
            remainingTime: videoCallRecord.getRemainingTime(),
            limitExceeded: videoCallRecord.limitExceeded
          });
          notifiedSockets.add(participantSocketId);
        }
        
        // Only send to room if no direct socket connection was found
        if (!participantSocketId) {
          io.to(participantId).emit('video_call_ended', {
            sessionId,
            endedBy: userId,
            timestamp: new Date().toISOString(),
            totalTimeSpent: videoCallRecord.totalTimeSpent,
            remainingTime: videoCallRecord.getRemainingTime(),
            limitExceeded: videoCallRecord.limitExceeded
          });
        }
      });
      
      // Clear any pending invitation notifications for this session on end
      try {
        const Notification = require('./models/Notification');
        Notification.deleteMany({
          type: 'video_call_invitation',
          relatedId: sessionId
        }).catch(() => {});
      } catch (e) {
        console.warn('⚠️ Failed to clear notifications on end-video-call:', e?.message || e);
      }
      
      // Acknowledge success back to client after persisting time
      try {
        if (typeof ack === 'function') {
          ack({
            ok: true,
            sessionId,
            totalTimeSpent: videoCallRecord.totalTimeSpent,
            remainingTime: videoCallRecord.getRemainingTime(),
            limitExceeded: videoCallRecord.limitExceeded
          });
        }
      } catch {}
      
    } catch (error) {
      console.error('Error handling video call end:', error);
      // Acknowledge error back to client
      try {
        if (typeof ack === 'function') {
          ack({ ok: false, error: error?.message || 'Failed to end video call' });
        }
      } catch {}
    }
  });

  // Handle peer-call-ended event from PeerJS service
  socket.on('peer-call-ended', async (data) => {
    
    // Check if data exists and has userId
    if (!data || !data.userId) {
      console.error('❌ peer-call-ended: Invalid data received:', data);
      return;
    }
    
    const { userId, sessionId, participantId } = data;
    
    // Enhanced logging for debugging
    console.log('⏱️ Peer call ended with data:', data);
    
    // If we have sessionId and participantId, use the proper video_call_ended event
    if (sessionId && participantId) {
      // Track call time before notifying participants
      try {
        const VideoCallTime = require('./models/VideoCallTime');
        const videoCallRecord = await VideoCallTime.getOrCreatePairRecord(userId, participantId);
        
        // Compute server-side duration when possible
        let serverMeasured = 0;
        const active = sessionId ? activeCalls.get(sessionId) : null;
        if (active && active.startAtMs) {
          serverMeasured = Math.max(0, Math.floor((Date.now() - active.startAtMs) / 1000));
          activeCalls.delete(sessionId);
        }
        
        // Enhanced time tracking with validation
        if (serverMeasured > 0) {
          const remainingBefore = videoCallRecord.getRemainingTime();
          let finalDuration = serverMeasured;
          // Cap to remaining time so we don't exceed the 5-minute budget
          if (finalDuration > remainingBefore) finalDuration = remainingBefore;
          
          const session = videoCallRecord.addCallTime(finalDuration, 'video');
          await videoCallRecord.save();
          console.log('✅ Tracked video call time on peer-call-ended:', { 
            sessionId, 
            finalDuration, 
            remainingAfter: videoCallRecord.getRemainingTime(),
            limitExceeded: videoCallRecord.limitExceeded
          });
        }
      } catch (error) {
        console.error('Error tracking video call time on peer-call-ended:', error);
      }
      
      const participants = [userId.toString(), participantId.toString()];
      const notifiedSockets = new Set();
      
      participants.forEach(pid => {
        const participantSocketId = onlineUsers.get(pid);
        if (participantSocketId && !notifiedSockets.has(participantSocketId)) {
          io.to(participantSocketId).emit('video_call_ended', {
            sessionId,
            endedBy: userId,
            timestamp: new Date().toISOString()
          });
          notifiedSockets.add(participantSocketId);
        }
        
        // Only send to room if no direct socket connection was found
        if (!participantSocketId) {
          io.to(pid).emit('video_call_ended', {
            sessionId,
            endedBy: userId,
            timestamp: new Date().toISOString()
          });
        }
      });

      // Clear notifications for this session
      try {
        const Notification = require('./models/Notification');
        Notification.deleteMany({
          type: 'video_call_invitation',
          relatedId: sessionId
        }).catch(() => {});
      } catch (e) {
        console.warn('⚠️ Failed to clear notifications on peer-call-ended:', e?.message || e);
      }
    } else {
      // Fallback: Broadcast termination to all connected clients for this user
      socket.broadcast.emit('peer_call_terminated', {
        terminatedBy: userId,
        timestamp: new Date().toISOString()
      });
    }
  });


  socket.on('decline-video-call', (data) => {
    io.to(data.callerId).emit('video-call-declined', {
      callerId: data.callerId,
      recipientId: data.recipientId,
      sessionId: data.sessionId
    });
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
});

// WebRTC namespace connection (for video call functionality)
webrtcNamespace.on('connection', (socket) => {

  socket.on('join', async (userId) => {
    // Use authenticated user ID for security
    const authenticatedUserId = socket.userId;
    socket.join(authenticatedUserId);
    webrtcUsers.set(authenticatedUserId, socket.id);
    
    // IMMEDIATE: Update user's online status in database with priority
    try {
      await User.findByIdAndUpdate(authenticatedUserId, { 
        lastSeen: new Date(),
        isOnline: true 
      });
      console.log('✅ WebRTC Database updated: User', authenticatedUserId, 'marked as online');
    } catch (error) {
      console.error('❌ Error updating WebRTC user online status:', error);
    }
    
    console.log('📹 WebRTC user joined:', authenticatedUserId, 'Socket:', socket.id);
    console.log('📹 WebRTC users count:', webrtcUsers.size);
    
    // Notify all connected sockets (including self) that this user is online for video calls
    io.emit('user-webrtc-ready', { userId: authenticatedUserId, timestamp: new Date().toISOString() });
    webrtcNamespace.emit('user-webrtc-ready', { userId: authenticatedUserId, timestamp: new Date().toISOString() });
    // Also emit directly to all sockets in /webrtc namespace
    Object.values(webrtcUsers).forEach((socketId) => {
      try {
        webrtcNamespace.to(socketId).emit('user-webrtc-ready', { userId: authenticatedUserId, timestamp: new Date().toISOString() });
      } catch (e) { console.error('Failed to emit user-webrtc-ready to', socketId, e); }
    });
  });

  // Handle video call invitation emitted from the /webrtc namespace
  socket.on('send-video-call-invitation', async (data) => {
    // DEBUG: Print webrtcUsers map at the moment of call invitation
    try {
      console.log('🟦 [DEBUG] webrtcUsers at call invitation:', Array.from(webrtcUsers.entries()));
    } catch (e) { console.error('🟥 [DEBUG] webrtcUsers print error:', e); }

    const recipientId = data.recipientId.toString();
    const callerId = data.callerId.toString();
    let videoCallRecord = null;
    let remainingTime = 300; // Default 5 minutes
    
    // Join the session room for coordinated communication
    if (data.sessionId) {
      socket.join(data.sessionId);
    }

    try {
      // Validate 5-minute video call limit
      videoCallRecord = await VideoCallTime.getOrCreatePairRecord(callerId, recipientId);
      if (!videoCallRecord.canMakeVideoCall()) {
        const rejectionMessage = {
          type: 'video_call_rejected',
          reason: 'time_limit_exceeded',
          message: 'Video call time limit (5 minutes) exceeded for this match. No more video calls allowed.',
          remainingTime: 0,
          limitExceeded: true,
          sessionId: data.sessionId
        };
        socket.emit('video_call_rejected', rejectionMessage);
        return;
      }
      remainingTime = videoCallRecord.getRemainingTime();
    } catch (error) {
      // Continue with call invitation even if time check fails (fallback)
    }

    // Create standardized video call message
    const videoCallMessage = {
      senderId: callerId,
      recipientId: recipientId,
      message: `${data.callerName} is inviting you to a video call`,
      messageType: 'video_call_invitation',
      videoCallData: {
        callerId: callerId,
        callerName: data.callerName,
        sessionId: data.sessionId,
        timestamp: data.timestamp,
        status: 'pending',
        remainingTime: remainingTime
      },
      createdAt: new Date().toISOString()
    };

    // Deliver via main namespace to ensure app-level listeners receive it
    const recipientSocketId = onlineUsers.get(recipientId);
    let notificationSent = false;

    if (recipientSocketId) {
      try {
        io.to(recipientSocketId).emit('video_call_invitation', videoCallMessage);
        // Also emit for activity feed
        io.to(recipientSocketId).emit('send-video-call-invitation', {
          callerId: callerId,
          callerName: data.callerName,
          callerUsername: data.callerUsername,
          recipientId: recipientId,
          sessionId: data.sessionId,
          timestamp: data.timestamp
        });
        notificationSent = true;
      } catch (error) {
        // Silent error handling
      }
    }

    // Also send to recipient's room as backup (main namespace)
    try {
      io.to(recipientId).emit('video_call_invitation', videoCallMessage);
      // Also emit for activity feed
      io.to(recipientId).emit('send-video-call-invitation', {
        callerId: callerId,
        callerName: data.callerName,
        callerUsername: data.callerUsername,
        recipientId: recipientId,
        sessionId: data.sessionId,
        timestamp: data.timestamp
      });
      notificationSent = true;
    } catch (error) {
      // Silent error handling
    }

    // LAYER 3: Broadcast fallback with client-side filtering
    try {
      io.emit('video_call_invitation_broadcast', {
        // Top-level fields for easier client handling
        callerId: callerId,
        callerName: data.callerName,
        callerUsername: data.callerUsername,
        recipientId: recipientId,
        sessionId: data.sessionId,
        timestamp: data.timestamp,
        // Original structured message for richer clients
        ...videoCallMessage,
        targetUserId: recipientId
      });
    } catch (error) {
      // Silent error handling
    }

    // Send result back to caller (webrtc namespace)
    socket.emit('video-call-invitation-result', {
      success: notificationSent,
      recipientOnline: !!recipientSocketId
    });
  });

  // WebRTC Signaling Handlers
  socket.on('video-call-offer', (data) => {
    
    // Check if recipient is online in WebRTC namespace
    const recipientSocketId = webrtcUsers.get(data.recipientId);
    if (recipientSocketId) {
      socket.to(data.recipientId).emit('video-call-offer', {
        offer: data.offer,
        callerId: socket.userId, // Use authenticated caller ID
        callerName: data.callerName,
        callerAvatar: data.callerAvatar
      });
    } else {
      socket.emit('video-call-failed', { message: 'Recipient is not online' });
    }
  });

  socket.on('video-call-answer', (data) => {
    socket.to(data.callerId).emit('video-call-answer', {
      answer: data.answer,
      recipientId: data.recipientId
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.recipientId).emit('ice-candidate', {
      candidate: data.candidate,
      senderId: data.senderId
    });
  });

  socket.on('video-call-reject', (data) => {
    socket.to(data.callerId).emit('video-call-rejected', {
      recipientId: data.recipientId
    });
  });

  socket.on('video-call-end', async (data) => {
    
    try {
      // Track video call time if duration is provided
      if (data.duration && data.userId && data.recipientId) {
        const videoCallRecord = await VideoCallTime.getOrCreatePairRecord(data.userId, data.recipientId);
        const session = videoCallRecord.addCallTime(data.duration, 'video');
        await videoCallRecord.save();
        
        // Video call time tracked successfully
        
        // Notify recipient about remaining time
        socket.to(data.recipientId).emit('video-call-ended', {
          userId: data.userId,
          duration: data.duration,
          totalTimeSpent: videoCallRecord.totalTimeSpent,
          remainingTime: videoCallRecord.getRemainingTime(),
          limitExceeded: videoCallRecord.limitExceeded
        });
        
        return;
      }
    } catch (error) {
      // Silent error handling for performance
    }
    
    // Fallback - notify recipient without time tracking
    socket.to(data.recipientId).emit('video-call-ended', {
      userId: data.userId
    });
  });

  socket.on('video-call-cancel', (data) => {
    socket.to(data.recipientId).emit('video-call-cancelled', {
      callerId: data.callerId
    });
  });

  socket.on('disconnect', async () => {
    let userIdToUpdate;
    for (let [userId, socketId] of webrtcUsers.entries()) {
      if (socketId === socket.id) {
        userIdToUpdate = userId;
        webrtcUsers.delete(userId);
        break;
      }
    }

    if (userIdToUpdate) {
      try {
        await User.findByIdAndUpdate(userIdToUpdate, { lastSeen: new Date() });
      } catch (error) {
        // Silent error handling
      }
    }
  });
});

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
app.use('/api/peerjs-video-call', peerjsRoutes);
app.use('/api/video-recording', videoRecordingRoutes);
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
  console.log('📹 WebRTC users map:', Array.from(webrtcUsers.entries()));
  
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
  const webrtcRooms = webrtcNamespace ? Array.from(webrtcNamespace.adapter.rooms.keys()) : [];
  
  console.log('🏠 Main namespace rooms:', mainRooms);
  console.log('📹 WebRTC namespace rooms:', webrtcRooms);
  
  res.json({
    onlineUsers: Array.from(onlineUsers.keys()),
    onlineUsersCount: onlineUsers.size,
    onlineUsersMap: Object.fromEntries(onlineUsers),
    webrtcUsers: Array.from(webrtcUsers.keys()),
    webrtcUsersCount: webrtcUsers.size,
    webrtcUsersMap: Object.fromEntries(webrtcUsers),
    recentlyActiveUsers: recentlyActiveUsers.map(u => ({
      id: u._id,
      name: `${u.fname} ${u.lname}`,
      username: u.username,
      lastSeen: u.lastSeen,
      isOnline: u.isOnline
    })),
    mainRooms,
    webrtcRooms,
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
