const { Server } = require('socket.io');
const User = require('../models/User');

let onlineUsers = new Map();
let webrtcUsers = new Map();

const initializeSocket = (server, corsOptions) => {
  const io = new Server(server, {
    path: '/socket.io/',
    cors: corsOptions,
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 30000,
    pingInterval: 15000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6,
    connectTimeout: 20000,
    serveClient: false,
    cookie: false,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const allowedOrigins = [
        process.env.FRONTEND_URL, 
        'http://localhost:8080', 
        'https://preview--quluub-reborn-project-99.lovable.app',
        'https://love.quluub.com',
        'https://match.quluub.com',
        'https://quluub-reborn-project-33.vercel.app'
      ].filter(Boolean);
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback('Origin not allowed', false);
      }
    },
    allowUpgrades: true,
    perMessageDeflate: {
      threshold: 1024,
      concurrencyLimit: 10,
      memLevel: 7
    }
  });

  // Main namespace
  io.use(async (socket, next) => {
    const userId = socket.handshake.query.userId;
    if (!userId) {
      return next(new Error('Authentication error: userId is required'));
    }
    socket.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    console.log('🔗 Main socket connected:', socket.id);

    socket.on('join', (userId) => {
      socket.join(userId);
      onlineUsers.set(userId, socket.id);
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
      console.log(`🏠 User ${userId} joined main room with socket ${socket.id}`);
    });

    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
      console.log(`💬 Socket ${socket.id} joined conversation room: ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`💬 Socket ${socket.id} left conversation room: ${conversationId}`);
    });

    // Video Call Handlers
    socket.on('send-video-call-invitation', (data) => {
        const recipientSocketId = onlineUsers.get(data.recipientId);
        if (recipientSocketId) {
            const videoCallMessage = {
                senderId: data.callerId,
                recipientId: data.recipientId,
                message: `${data.callerName} is inviting you to a video call`,
                messageType: 'video_call_invitation',
                videoCallData: {
                    callerId: data.callerId,
                    callerName: data.callerName,
                    sessionId: data.sessionId,
                    timestamp: data.timestamp,
                    status: 'pending'
                },
                createdAt: new Date().toISOString()
            };
            io.to(data.callerId).emit('new_message', videoCallMessage);
            io.to(data.recipientId).emit('new_message', videoCallMessage);
            io.to(data.recipientId).emit('video_call_invitation', videoCallMessage);
            io.to(recipientSocketId).emit('video_call_invitation', videoCallMessage);
            io.to(recipientSocketId).emit('new_message', videoCallMessage);
        } else {
            socket.emit('video-call-failed', { message: 'Recipient is not online' });
        }
    });

    socket.on('accept-call', (data) => {
        socket.broadcast.emit('call_accepted', {
            sessionId: data.sessionId || data.roomId,
            recipientName: data.recipientName
        });
    });

    socket.on('decline-video-call', (data) => {
        io.to(data.callerId).emit('video-call-declined', data);
    });

    socket.on('end-video-call', (data) => {
        io.to(data.callerId).emit('video-call-ended', data);
        io.to(data.recipientId).emit('video-call-ended', data);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Main socket disconnected:', socket.id);
      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    });
  });

  // WebRTC namespace
  const webrtcNamespace = io.of('/webrtc');
  webrtcNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error: No token provided'));
      
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (!user) return next(new Error('Authentication error: User not found'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  webrtcNamespace.on('connection', (socket) => {
    console.log('📹 WebRTC socket connected:', socket.id, 'User ID:', socket.userId);

    socket.on('join', (userId) => {
        const authenticatedUserId = socket.userId;
        socket.join(authenticatedUserId);
        webrtcUsers.set(authenticatedUserId, socket.id);
        console.log(`🏠 User ${socket.user.fname} (${authenticatedUserId}) joined WebRTC room with socket ${socket.id}`);
    });

    socket.on('video-call-offer', (data) => {
        const recipientSocketId = webrtcUsers.get(data.recipientId);
        if (recipientSocketId) {
            socket.to(data.recipientId).emit('video-call-offer', {
                offer: data.offer,
                callerId: socket.userId,
                callerName: data.callerName,
                callerAvatar: data.callerAvatar
            });
        } else {
            socket.emit('video-call-failed', { message: 'Recipient is not online' });
        }
    });

    socket.on('video-call-answer', (data) => {
        socket.to(data.callerId).emit('video-call-answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.recipientId).emit('ice-candidate', data);
    });

    socket.on('video-call-reject', (data) => {
        socket.to(data.callerId).emit('video-call-rejected', data);
    });

    socket.on('video-call-end', (data) => {
        socket.to(data.recipientId).emit('video-call-ended', data);
    });

    socket.on('video-call-cancel', (data) => {
        socket.to(data.recipientId).emit('video-call-cancelled', data);
    });

    socket.on('disconnect', async () => {
      console.log('🔌 WebRTC user disconnected:', socket.id);
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
          console.error('Failed to update lastSeen on disconnect:', error);
        }
      }
    });
  });

  return io;
};

module.exports = { initializeSocket };
