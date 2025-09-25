const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
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
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // TURN servers for users behind NAT/firewalls
    {
      urls: 'turn:relay1.expressturn.com:3478',
      username: 'efJBIBF0YIPZ8USRBH',
      credential: 'T4rSq09kikgUFfWdmhGZc1XrMq',
    },
    {
      urls: 'turn:relay1.expressturn.com:3478?transport=tcp',
      username: 'efJBIBF0YIPZ8USRBH',
      credential: 'T4rSq09kikgUFfWdmhGZc1XrMq',
    },
  ]
});

app.use('/peerjs', peerServer);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // Allow all origins for maximum compatibility
    callback(null, true);
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false
};

app.use(cors(corsOptions));
// Enable HTTP compression for faster API responses
app.use(compression({ level: 6 }));
app.use(express.json());


// OPTIMIZED SOCKET.IO CONFIGURATION FOR PRODUCTION
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'], // Prioritize websocket for better performance
  
  // Aggressive performance optimizations
  pingTimeout: 20000, // 20 seconds
  pingInterval: 10000, // 10 seconds
  upgradeTimeout: 5000, // 5 seconds
  
  // Reduced buffer sizes for faster processing
  maxHttpBufferSize: 5e5, // 500KB (reduced from 1MB)
  connectTimeout: 10000, // 10 seconds
  
  // Maximum performance settings
  serveClient: false,
  cookie: false,
  
  // Simplified connection validation
  allowRequest: (req, callback) => {
    callback(null, true); // Allow all for maximum speed
  },
  
  // Optimized compression
  perMessageDeflate: {
    threshold: 512, // Compress smaller messages
    concurrencyLimit: 5, // Reduce concurrency for speed
    memLevel: 6
  }
});

// Initialize user tracking maps
let onlineUsers = new Map();
let webrtcUsers = new Map();

// Attach Socket.IO instance to Express app for route access
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Create WebRTC namespace for video call functionality
const webrtcNamespace = io.of('/webrtc');


// Socket.IO authentication middleware for WebRTC namespace
webrtcNamespace.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User = require('./models/User');
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    console.log('✅ Socket authenticated for user:', user.fname, user._id);
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    next(new Error('Authentication error'));
  }
});

// Main namespace connection (for general app functionality)
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(userId);
    onlineUsers.set(userId.toString(), socket.id);
    // Throttle online users broadcast for performance
    if (onlineUsers.size % 10 === 0) {
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    }
  });

  // CONVERSATION ROOM MANAGEMENT
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
  });

  // VIDEO CALL NOTIFICATION SYSTEM
  socket.on('send-video-call-invitation', async (data) => {
    console.log('📞 BACKEND DEBUG: Received video call invitation:', data);
    
    const recipientId = data.recipientId.toString();
    const callerId = data.callerId.toString();
    console.log('📞 BACKEND DEBUG: Parsed IDs - Caller:', callerId, 'Recipient:', recipientId);
    let videoCallRecord = null;
    let remainingTime = 300; // Default 5 minutes

    try {
      // Check if users can make video calls (5-minute limit validation)
      videoCallRecord = await VideoCallTime.getOrCreatePairRecord(callerId, recipientId);
      
      if (!videoCallRecord.canMakeVideoCall()) {
        // Send rejection message to caller
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

      // Add remaining time info to the invitation
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

    // Single reliable notification - direct to recipient
    const recipientSocketId = onlineUsers.get(recipientId);
    let notificationSent = false;
    
    console.log('📞 BACKEND DEBUG: Recipient socket lookup:', { recipientId, recipientSocketId, onlineUsersSize: onlineUsers.size });
    
    if (recipientSocketId) {
      try {
        console.log('📞 BACKEND DEBUG: Emitting video_call_invitation to socket:', recipientSocketId);
        io.to(recipientSocketId).emit('video_call_invitation', videoCallMessage);
        // Also emit for activity feed
        console.log('📞 BACKEND DEBUG: Emitting send-video-call-invitation to socket:', recipientSocketId);
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
        console.error('📞 BACKEND DEBUG: Error emitting to direct socket:', error);
      }
    } else {
      console.log('📞 BACKEND DEBUG: Recipient not found in onlineUsers, trying room-based notification');
    }

    // Also send to recipient's room as backup
    try {
      console.log('📞 BACKEND DEBUG: Emitting to recipient room:', recipientId);
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
      console.error('📞 BACKEND DEBUG: Error emitting to room:', error);
    }

    // LAYER 3: Broadcast fallback with client-side filtering
    try {
      console.log('📞 BACKEND DEBUG: Emitting broadcast fallback');
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
      console.error('📞 BACKEND DEBUG: Error emitting broadcast:', error);
    }

    // Send result back to caller
    socket.emit('video-call-invitation-result', {
      success: notificationSent,
      recipientOnline: !!recipientSocketId
    });

    // Removed verbose logging for performance
  });

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
  });

  socket.on('accept-video-call', (data) => {
    io.to(data.callerId).emit('video-call-accepted', {
      callerId: data.callerId,
      recipientId: data.recipientId,
      sessionId: data.sessionId
    });
  });

  // Handle call termination - broadcast to both participants
  socket.on('end-video-call', async (data) => {
    const { sessionId, userId, participantId, duration } = data;
    
    try {
      // Track video call time if duration is provided
      if (duration && userId && participantId) {
        const VideoCallTime = require('./models/VideoCallTime');
        const videoCallRecord = await VideoCallTime.getOrCreatePairRecord(userId, participantId);
        const session = videoCallRecord.addCallTime(duration, 'video');
        await videoCallRecord.save();
      }
      
      // Broadcast call end to both participants
      const participants = [userId.toString(), participantId.toString()];
      
      participants.forEach(participantId => {
        const participantSocketId = onlineUsers.get(participantId);
        if (participantSocketId) {
          io.to(participantSocketId).emit('video_call_ended', {
            sessionId,
            endedBy: userId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Also send to participant's room
        io.to(participantId).emit('video_call_ended', {
          sessionId,
          endedBy: userId,
          timestamp: new Date().toISOString()
        });
      });
      
      console.log(`📞 Video call ended - Session: ${sessionId}, Ended by: ${userId}`);
      
    } catch (error) {
      console.error('Error handling video call end:', error);
    }
  });


  // Handle accept-call event from frontend
  socket.on('accept-call', (data) => {
    
    // Find the caller's socket and notify them
    // The roomId/sessionId contains the caller info
    if (data.roomId || data.sessionId) {
      // Emit to all sockets in the room (this will reach the caller)
      socket.broadcast.emit('call_accepted', {
        sessionId: data.sessionId || data.roomId,
        recipientName: data.recipientName
      });
      // Emitted call_accepted event to notify caller
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

  socket.on('join', (userId) => {
    // Use authenticated user ID for security
    const authenticatedUserId = socket.userId;
    socket.join(authenticatedUserId);
    webrtcUsers.set(authenticatedUserId, socket.id);
  });

  // Handle video call invitation emitted from the /webrtc namespace
  socket.on('send-video-call-invitation', async (data) => {
    const recipientId = data.recipientId.toString();
    const callerId = data.callerId.toString();
    let videoCallRecord = null;
    let remainingTime = 300; // Default 5 minutes

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

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  
  // Start email scheduler for automated notifications
  startScheduler();
  
  // Create database indexes for optimal performance after MongoDB connects
  mongoose.connection.once('connected', async () => {
    setTimeout(async () => {
      await createIndexes();
    }, 1000);
  });
});
