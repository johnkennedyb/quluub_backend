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
  debug: true,
  path: '/',
  allow_discovery: true,
  proxied: true,
  cors: {
    origin: [
      'https://quluub-reborn-project-33.vercel.app',
      'http://localhost:8080',
      'https://preview--quluub-reborn-project-99.lovable.app',
      'https://love.quluub.com',
      'https://match.quluub.com', // Added production frontend

    ],
    credentials: true
  },
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    },
  ].filter(s => s.urls), // Filter out TURN server if not configured
});

app.use('/peerjs', peerServer);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.CLIENT_URL,
      'http://localhost:8080',
      'http://localhost:5173',
      'https://preview--quluub-reborn-project-99.lovable.app',
      'https://love.quluub.com',
      'https://match.quluub.com',
      'https://quluub-reborn-project-33.vercel.app'
    ].filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`🚫 CORS blocked origin: ${origin}`);
      console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(null, true); // Allow all origins in production for now
    }
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false
};

app.use(cors(corsOptions));
app.use(express.json());

// Performance monitoring disabled for production speed
// if (process.env.ENABLE_PERFORMANCE_LOGGING === 'true') {
//   app.use(trackRequestPerformance);
//   console.log('📈 Performance monitoring enabled');
// }

// OPTIMIZED SOCKET.IO CONFIGURATION FOR PRODUCTION
const io = new Server(server, {
  path: '/socket.io/', // Explicitly define the path
  cors: corsOptions,
  transports: ['polling', 'websocket'], // Prioritize polling for shared hostingPrefer websocket for better performance
  allowEIO3: true,
  
  // Connection timeouts optimized for real-time performance
  pingTimeout: 30000, // 30 seconds (reduced from 60s)
  pingInterval: 15000, // 15 seconds (reduced from 25s)
  upgradeTimeout: 10000, // 10 seconds (reduced from 30s)
  
  // Buffer and connection limits
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 20000, // 20 seconds connection timeout
  
  // Performance optimizations
  serveClient: false, // Don't serve socket.io client files
  cookie: false, // Disable cookies for better performance
  
  // Connection validation
  allowRequest: (req, callback) => {
    // Basic rate limiting and validation
    const origin = req.headers.origin;
    const allowedOrigins = [
      process.env.FRONTEND_URL, 
      'http://localhost:8080', 
      'https://preview--quluub-reborn-project-99.lovable.app',
      'https://love.quluub.com',
      'https://match.quluub.com', // Added production frontend
      'https://quluub-reborn-project-33.vercel.app'
    ].filter(Boolean);
    
    // Removed verbose logging for performance
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback('Origin not allowed', false);
    }
  },
  
  // Engine.IO options for better performance
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024, // Compress messages larger than 1KB
    concurrencyLimit: 10,
    memLevel: 7
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

// Socket.IO authentication middleware for main namespace
io.use(async (socket, next) => {
  const userId = socket.handshake.query.userId;
  if (!userId) {
    return next(new Error('Authentication error: userId is required'));
  }
  socket.userId = userId;
  next();
});

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
  // Removed verbose socket logging for performance

  socket.on('join', (userId) => {
    socket.join(userId);
    onlineUsers.set(userId.toString(), socket.id);
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
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
    
    const recipientId = data.recipientId.toString();
    const callerId = data.callerId.toString();
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
    
    if (recipientSocketId) {
      try {
        io.to(recipientSocketId).emit('video_call_invitation', videoCallMessage);
        notificationSent = true;
      } catch (error) {
        // Silent error handling
      }
    }

    // Also send to recipient's room as backup
    try {
      io.to(recipientId).emit('video_call_invitation', videoCallMessage);
      notificationSent = true;
    } catch (error) {
      // Silent error handling
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
    }
    
    // Also send to caller's room
    io.to(callerId.toString()).emit('video_call_rejected', {
      sessionId,
      reason,
      message: reason === 'busy' ? 'User is currently busy' : 'Call was declined'
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
  socket.on('end-video-call', (data) => {
    const { sessionId, userId, participantId } = data;
    
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
    
    // Video call end notification sent to both participants
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

  socket.on('end-video-call', async (data) => {
    
    try {
      // Track video call time if duration is provided
      if (data.duration && data.callerId && data.recipientId) {
        const videoCallRecord = await VideoCallTime.getOrCreatePairRecord(data.callerId, data.recipientId);
        const session = videoCallRecord.addCallTime(data.duration, 'video');
        await videoCallRecord.save();
        
        // Video call time tracked successfully
        
        // Notify both participants about remaining time
        const timeInfo = {
          sessionId: data.sessionId,
          duration: data.duration,
          totalTimeSpent: videoCallRecord.totalTimeSpent,
          remainingTime: videoCallRecord.getRemainingTime(),
          limitExceeded: videoCallRecord.limitExceeded,
          endedBy: data.endedBy || 'unknown'
        };
        
        io.to(data.callerId).emit('video-call-ended', timeInfo);
        io.to(data.recipientId).emit('video-call-ended', timeInfo);
        
        return;
      }
    } catch (error) {
      // Silent error handling for performance
    }
    
    // Fallback - notify participants without time tracking
    io.to(data.callerId).emit('video-call-ended', {
      sessionId: data.sessionId,
      endedBy: data.endedBy || 'unknown'
    });
    io.to(data.recipientId).emit('video-call-ended', {
      sessionId: data.sessionId,
      endedBy: data.endedBy || 'unknown'
    });
  });


  socket.on('disconnect', () => {
    // Remove from online users
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
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
