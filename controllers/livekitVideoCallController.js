const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const User = require('../models/User');
const Notification = require('../models/Notification');
const VideoCallTime = require('../models/VideoCallTime');

// LiveKit configuration
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';

// Initialize LiveKit Room Service Client
const roomService = new RoomServiceClient(LIVEKIT_WS_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// @desc    Clear LiveKit video call notifications
// @route   DELETE /api/livekit-video-call/notifications/:sessionId
// @access  Private
exports.clearLivekitVideoCallNotifications = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  try {
    await Notification.deleteMany({
      user: userId,
      type: 'livekit_video_call_invitation',
      relatedId: sessionId
    });

    res.status(200).json({ message: 'LiveKit video call notifications cleared' });
  } catch (error) {
    console.error('Error clearing LiveKit video call notifications:', error);
    res.status(500).json({ message: 'Failed to clear notifications' });
  }
});

// @desc    Initiate a LiveKit video call
// @route   POST /api/livekit-video-call/initiate
// @access  Private
exports.initiateLivekitCall = asyncHandler(async (req, res) => {
  const { recipientId, sessionId } = req.body;
  const callerId = req.user._id;

  if (!recipientId || !sessionId) {
    res.status(400);
    throw new Error('Recipient ID and Session ID are required');
  }

  const [caller, recipient] = await Promise.all([
    User.findById(callerId).select('fname lname username'),
    User.findById(recipientId).select('isOnline lastSeen')
  ]);

  if (!caller || !recipient) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Check time limits
  try {
    const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:5000'}/api/video-call-time/can-call/${callerId}/${recipientId}`);
    
    if (!response.ok) {
      console.error('❌ LIVEKIT: Time check API failed:', response.status);
      return res.status(500).json({ message: 'Time limit check failed' });
    }

    const timeData = await response.json();
    
    if (!timeData.canCall) {
      console.log('❌ LIVEKIT: Time limit exceeded for users:', callerId, recipientId);
      return res.status(403).json({ 
        message: 'Time limit exceeded',
        timeData 
      });
    }

    console.log('✅ LIVEKIT: Time check passed:', timeData);

  } catch (error) {
    console.error('❌ LIVEKIT: Time check failed:', error);
    return res.status(500).json({ message: 'Time limit check failed' });
  }

  // Check if recipient is online
  const isRecipientOnline = await checkUserOnlineStatus(recipientId);
  
  if (!isRecipientOnline) {
    return res.status(400).json({ 
      message: 'User is offline, he will be notified when he is online' 
    });
  }

  try {
    // Create LiveKit room
    const roomName = `quluub-call-${sessionId}`;
    const room = await createLivekitRoom(roomName);
    
    // Generate tokens for both participants
    const callerToken = generateAccessToken(roomName, callerId.toString());
    const recipientToken = generateAccessToken(roomName, recipientId.toString());

    // Create notification in database
    const notificationData = {
      callerId: callerId.toString(),
      callerName: `${caller.fname} ${caller.lname}`,
      recipientId: recipientId.toString(),
      sessionId,
      roomName,
      roomUrl: LIVEKIT_WS_URL,
      callerToken,
      recipientToken,
      type: 'livekit_video_call_invitation'
    };

    await Notification.findOneAndUpdate(
      {
        user: recipientId,
        type: 'livekit_video_call_invitation',
        relatedId: sessionId
      },
      {
        user: recipientId,
        type: 'livekit_video_call_invitation',
        relatedId: sessionId,
        message: `${caller.fname} ${caller.lname} is inviting you to a LiveKit video call`,
        data: notificationData,
        createdAt: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    // Emit socket notification to recipient
    const io = req.app.get('io');
    const recipientKey = recipientId.toString();
    
    console.log('📹 LIVEKIT: Emitting invitation to recipient room:', recipientKey);
    
    io.to(recipientKey).emit('livekit_video_call_invitation', {
      callerId: callerId.toString(),
      callerName: `${caller.fname} ${caller.lname}`,
      recipientId: recipientId.toString(),
      sessionId,
      roomName,
      roomUrl: LIVEKIT_WS_URL,
      recipientToken,
      type: 'livekit_video_call_invitation',
      timestamp: Date.now()
    });

    res.status(200).json({
      message: 'LiveKit video call invitation sent successfully',
      sessionId,
      roomName,
      roomUrl: LIVEKIT_WS_URL,
      callerToken,
      onlineStatus: {
        isOnline: true,
        method: 'comprehensive_check'
      }
    });

  } catch (error) {
    console.error('❌ LIVEKIT: Failed to initiate call:', error);
    res.status(500).json({ message: 'Failed to initiate LiveKit video call' });
  }
});

// @desc    Get active LiveKit video call invitations
// @route   GET /api/livekit-video-call/invitations
// @access  Private
exports.getActiveLivekitInvitations = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  try {
    const notifications = await Notification.find({
      user: userId,
      type: 'livekit_video_call_invitation',
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
    }).sort({ createdAt: -1 });

    const invitations = await Promise.all(
      notifications.map(async (notification) => {
        const callerId = notification.data?.callerId;
        
        if (!callerId) {
          console.warn('⚠️ LIVEKIT: Missing callerId in notification data:', notification._id);
          return null;
        }

        try {
          const caller = await User.findById(callerId).select('fname lname username');
          
          if (!caller) {
            console.warn('⚠️ LIVEKIT: Caller not found:', callerId);
            return null;
          }

          return {
            sessionId: notification.relatedId,
            callerId: callerId,
            callerName: notification.data.callerName || `${caller.fname} ${caller.lname}`,
            roomName: notification.data.roomName,
            roomUrl: notification.data.roomUrl,
            recipientToken: notification.data.recipientToken,
            timestamp: notification.createdAt,
            type: 'livekit_video_call_invitation'
          };
        } catch (error) {
          console.error('❌ LIVEKIT: Error processing invitation:', error);
          return null;
        }
      })
    );

    const validInvitations = invitations.filter(inv => inv !== null);

    res.status(200).json({
      invitations: validInvitations,
      count: validInvitations.length
    });

  } catch (error) {
    console.error('❌ LIVEKIT: Error fetching invitations:', error);
    res.status(500).json({ message: 'Failed to fetch LiveKit video call invitations' });
  }
});

// @desc    Accept LiveKit video call
// @route   POST /api/livekit-video-call/accept
// @access  Private
exports.acceptLivekitCall = asyncHandler(async (req, res) => {
  const { sessionId, callerId } = req.body;
  const recipientId = req.user._id;

  if (!sessionId || !callerId) {
    res.status(400);
    throw new Error('Session ID and Caller ID are required');
  }

  try {
    // Find the notification
    const notification = await Notification.findOne({
      user: recipientId,
      type: 'livekit_video_call_invitation',
      relatedId: sessionId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Video call invitation not found' });
    }

    // Get room details from notification
    const roomName = notification.data?.roomName;
    const roomUrl = notification.data?.roomUrl;
    const recipientToken = notification.data?.recipientToken;

    if (!roomName || !roomUrl || !recipientToken) {
      return res.status(400).json({ message: 'Invalid room data in notification' });
    }

    // Emit acceptance to caller
    const io = req.app.get('io');
    const callerKey = callerId.toString();
    
    io.to(callerKey).emit('livekit_call_accepted', {
      sessionId,
      recipientId: recipientId.toString(),
      roomName,
      roomUrl,
      timestamp: Date.now()
    });

    // Clean up notification
    await Notification.deleteOne({ _id: notification._id });

    res.status(200).json({
      message: 'LiveKit video call accepted',
      roomName,
      roomUrl,
      recipientToken
    });

  } catch (error) {
    console.error('❌ LIVEKIT: Error accepting call:', error);
    res.status(500).json({ message: 'Failed to accept LiveKit video call' });
  }
});

// Helper function to create LiveKit room
async function createLivekitRoom(roomName) {
  try {
    console.log('📹 LIVEKIT: Creating room:', roomName);
    
    const room = await roomService.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60, // 10 minutes
      maxParticipants: 2,
      metadata: JSON.stringify({
        createdBy: 'quluub-platform',
        purpose: 'video-call'
      })
    });

    console.log('✅ LIVEKIT: Room created successfully:', room.name);
    return room;

  } catch (error) {
    // Room might already exist, which is fine
    if (error.message && error.message.includes('already exists')) {
      console.log('📹 LIVEKIT: Room already exists:', roomName);
      return { name: roomName };
    }
    
    console.error('❌ LIVEKIT: Failed to create room:', error);
    throw error;
  }
}

// Helper function to generate access token
function generateAccessToken(roomName, participantIdentity) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    ttl: '1h', // Token valid for 1 hour
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

// Helper function to check user online status
async function checkUserOnlineStatus(userId) {
  try {
    // Check socket connections
    const io = require('../server').io;
    if (io) {
      const userRoom = userId.toString();
      const socketsInRoom = await io.in(userRoom).fetchSockets();
      
      if (socketsInRoom.length > 0) {
        console.log('✅ LIVEKIT: User online via socket connection:', userId);
        return true;
      }
    }

    // Check recent activity (last 5 minutes)
    const user = await User.findById(userId).select('lastSeen isOnline');
    if (user) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      if (user.isOnline || (user.lastSeen && user.lastSeen > fiveMinutesAgo)) {
        console.log('✅ LIVEKIT: User online via database check:', userId);
        return true;
      }
    }

    console.log('❌ LIVEKIT: User appears offline:', userId);
    return false;

  } catch (error) {
    console.error('❌ LIVEKIT: Error checking online status:', error);
    return false;
  }
}

// Helper function to delete LiveKit room
async function deleteLivekitRoom(roomName) {
  try {
    console.log('📹 LIVEKIT: Deleting room:', roomName);
    await roomService.deleteRoom(roomName);
    console.log('✅ LIVEKIT: Room deleted successfully:', roomName);
  } catch (error) {
    console.error('❌ LIVEKIT: Failed to delete room:', error);
  }
}

module.exports = {
  clearLivekitVideoCallNotifications: exports.clearLivekitVideoCallNotifications,
  initiateLivekitCall: exports.initiateLivekitCall,
  getActiveLivekitInvitations: exports.getActiveLivekitInvitations,
  acceptLivekitCall: exports.acceptLivekitCall,
  createLivekitRoom,
  generateAccessToken,
  deleteLivekitRoom
};
