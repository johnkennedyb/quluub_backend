const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Notification = require('../models/Notification');
const VideoCallTime = require('../models/VideoCallTime');
const { StreamClient } = require('@stream-io/node-sdk');
const { sendVideoCallNotificationEmail } = require('../utils/emailService');

// GetStream.io credentials for professional video sessions
const GETSTREAM_API_KEY = 'zkhmtk6srdk3';
const GETSTREAM_SECRET = '7q7dumywgx4swpa2yqt52t5fvh47cvwg5svwmedms3mwu33mb9dqtujjzpvwxw9h';
const GETSTREAM_APP_ID = '1434472';

// Initialize GetStream client
const streamClient = new StreamClient(GETSTREAM_API_KEY, GETSTREAM_SECRET);

// Session management - different from call management
const activeSessions = new Map(); // sessionId -> sessionData
const sessionParticipants = new Map(); // sessionId -> Set of participantIds

// Modern participant availability checker for professional sessions
const isParticipantAvailable = async (participantId) => {
  try {
    console.log(`🌟 Checking participant availability for professional session: ${participantId}`);
    
    // Enhanced availability check for professional sessions
    const participant = await User.findById(participantId);
    if (!participant) {
      console.log(`❌ Participant ${participantId} not found`);
      return { available: false, reason: 'participant_not_found' };
    }
    
    // Method 1: Check if participant is in an active session
    for (const [sessionId, participants] of sessionParticipants.entries()) {
      if (participants.has(participantId)) {
        console.log(`📊 Participant ${participantId} is already in session: ${sessionId}`);
        return { available: false, reason: 'already_in_session' };
      }
    }
    
    // Method 2: Check recent activity (extended to 7 minutes for professional sessions)
    if (participant.lastSeen) {
      const sevenMinutesAgo = new Date(Date.now() - 7 * 60 * 1000);
      const isRecentlyActive = participant.lastSeen > sevenMinutesAgo;
      console.log(`📊 Professional session activity check: ${isRecentlyActive} (lastSeen: ${participant.lastSeen})`);
      
      if (isRecentlyActive) {
        return { available: true, reason: 'recently_active' };
      }
    }
    
    // Method 3: Check database online flag
    if (participant.isOnline) {
      console.log(`📊 Participant online flag: true`);
      return { available: true, reason: 'online_flag' };
    }
    
    console.log(`📊 Participant ${participantId} appears to be unavailable`);
    return { available: false, reason: 'offline' };
  } catch (error) {
    console.error(`❌ Error checking participant availability for ${participantId}:`, error);
    return { available: false, reason: 'error' };
  }
};

// Session time limit checker for professional sessions
const checkSessionTimeLimit = async (hostId, participantId) => {
  try {
    console.log(`🎬 Checking professional session time limit for ${hostId}-${participantId}`);
    
    // Use VideoCallTime model with enhanced session tracking
    const record = await VideoCallTime.getOrCreatePairRecord(hostId, participantId);
    const canStartSession = record.canMakeVideoCall();
    const remainingSessionTime = record.getRemainingTime();
    
    console.log(`🎬 Professional session time check:`, {
      totalSessionTime: record.totalTimeSpent,
      remainingSessionTime,
      canStartSession,
      sessionLimitExceeded: record.limitExceeded
    });
    
    return {
      canStartSession,
      remainingSessionTime,
      totalSessionTime: record.totalTimeSpent,
      sessionQuota: 300 // 5 minutes for professional sessions
    };
  } catch (error) {
    console.error('❌ Error checking professional session time limit:', error);
    // Default to allowing session if check fails
    return { canStartSession: true, remainingSessionTime: 300, totalSessionTime: 0 };
  }
};

// @desc Generate GetStream session token for professional video
// @route POST /api/getstream-video-call/token
// @access Private
const generateSessionToken = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID is required for professional session token' 
      });
    }

    console.log(`🎫 Generating GetStream professional session token for user: ${userId}`);

    // Ensure the user exists in GetStream (server-side upsert)
    try {
      const dbUser = await User.findById(userId).lean();
      const displayName = dbUser?.firstName || dbUser?.fname || dbUser?.username || dbUser?._id?.toString() || userId;
      const image = dbUser?.avatar || dbUser?.image || undefined;
      await streamClient.upsertUsers([
        {
          id: userId,
          role: 'user',
          name: displayName,
          ...(image ? { image } : {}),
          custom: {}
        }
      ]);
      console.log(`👤 Upserted GetStream user for token: ${userId}`);
    } catch (e) {
      console.warn('⚠️ Failed to upsert GetStream user before token generation:', e?.message || e);
    }

    // Generate token for the user (Video Node SDK)
    const token = streamClient.generateUserToken({ user_id: userId });
    
    console.log(`✨ GetStream professional session token generated for user: ${userId}`);
    
    res.json({ 
      success: true,
      token,
      apiKey: GETSTREAM_API_KEY,
      appId: GETSTREAM_APP_ID
    });
  } catch (error) {
    console.error('❌ Error generating GetStream session token:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate professional session token', 
      error: error.message 
    });
  }
});

// @desc Create GetStream professional video session
// @route POST /api/getstream-video-call/create-session
// @access Private
const createProfessionalSession = asyncHandler(async (req, res) => {
  try {
    const { participantId, sessionId, sessionToken, hostName, sessionType } = req.body;
    const hostId = req.user.id;

    console.log(`🎬 Creating GetStream professional session:`, {
      hostId,
      participantId,
      sessionId,
      sessionType
    });

    // Validate required fields
    if (!participantId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Participant ID and Session ID are required for professional session'
      });
    }

    // Check if participant is available for professional session
    const availabilityCheck = await isParticipantAvailable(participantId);
    if (!availabilityCheck.available) {
      console.log(`❌ Participant ${participantId} not available: ${availabilityCheck.reason}`);
      
      const messages = {
        'participant_not_found': 'Participant not found',
        'already_in_session': 'Participant is already in another professional session',
        'offline': 'Participant is currently offline. They will be notified when they come online.',
        'error': 'Unable to check participant availability'
      };

      return res.status(400).json({
        success: false,
        message: messages[availabilityCheck.reason] || 'Participant not available',
        reason: availabilityCheck.reason
      });
    }

    // Check session time limits
    const timeCheck = await checkSessionTimeLimit(hostId, participantId);
    if (!timeCheck.canStartSession) {
      console.log(`❌ Session time limit exceeded for ${hostId}-${participantId}`);
      return res.status(400).json({
        success: false,
        message: 'Professional session time limit exceeded',
        timeLimit: true,
        totalSessionTime: timeCheck.totalSessionTime,
        sessionQuota: timeCheck.sessionQuota
      });
    }

    // Ensure both host and participant exist in GetStream (required before referencing in calls)
    try {
      const [hostDb, participantDb] = await Promise.all([
        User.findById(hostId).lean(),
        User.findById(participantId).lean()
      ]);
      const hostDisplay = hostName || hostDb?.firstName || hostDb?.fname || hostDb?.username || hostId;
      const hostImage = hostDb?.avatar || hostDb?.image || undefined;
      const participantDisplay = participantDb?.firstName || participantDb?.fname || participantDb?.username || participantId;
      const participantImage = participantDb?.avatar || participantDb?.image || undefined;

      await streamClient.upsertUsers([
        {
          id: hostId,
          role: 'user',
          name: hostDisplay,
          ...(hostImage ? { image: hostImage } : {}),
          custom: {}
        },
        {
          id: participantId,
          role: 'user',
          name: participantDisplay,
          ...(participantImage ? { image: participantImage } : {}),
          custom: {}
        }
      ]);
      console.log('👥 Upserted GetStream users for session:', { hostId, participantId });
    } catch (e) {
      console.warn('⚠️ Failed to upsert GetStream users before session create:', e?.message || e);
      // Continue; frontend may retry create/join
    }

    // Create session data
    const sessionData = {
      sessionId,
      hostId,
      hostName: hostName || 'Professional Host',
      participantId,
      sessionType: sessionType || 'professional_video',
      createdAt: new Date(),
      status: 'pending',
      sessionToken,
      remainingTime: timeCheck.remainingSessionTime
    };

    // Store session in memory
    activeSessions.set(sessionId, sessionData);
    sessionParticipants.set(sessionId, new Set([hostId])); // Host joins first

    // Create enhanced notification for professional session
    // IMPORTANT: Use existing enum type 'getstream_video_call_invitation' so it passes schema validation
    // and is returned by getActiveInvitations()
    const notification = new Notification({
      user: participantId,
      type: 'getstream_video_call_invitation',
      data: {
        // Align with existing consumers that expect caller fields
        callerId: hostId,
        callerName: sessionData.hostName,
        recipientId: participantId,
        sessionId,
        // Keep session info for professional sessions
        sessionType: sessionData.sessionType,
        sessionToken,
        timestamp: new Date().toISOString(),
        remainingTime: timeCheck.remainingSessionTime
      },
      message: `${sessionData.hostName} is inviting you to a professional video session`,
      isRead: false
    });

    await notification.save();
    console.log(`✨ Professional session notification created for participant: ${participantId}`);

    // Emit session invitation via socket
    const io = req.app.get('io');
    if (io) {
      // Enhanced session invitation event
      io.to(participantId).emit('getstream_video_session_invitation', {
        sessionId,
        hostId,
        hostName: sessionData.hostName,
        // Add caller-parity fields for frontend compatibility
        callerId: hostId,
        callerName: sessionData.hostName,
        participantId,
        sessionType: sessionData.sessionType,
        message: `${sessionData.hostName} wants to start a professional video session`,
        timestamp: new Date().toISOString(),
        notificationType: 'session_invitation',
        priority: 'high'
      });

      console.log(`🌟 Professional session invitation sent to participant: ${participantId}`);
    }

    try {
      const [hostUser, participantUser] = await Promise.all([
        User.findById(hostId),
        User.findById(participantId)
      ]);

      if (hostUser && participantUser) {
        let femaleUser = null;
        let maleUser = null;
        if (hostUser.gender === 'female') {
          femaleUser = hostUser;
          maleUser = participantUser;
        } else if (participantUser.gender === 'female') {
          femaleUser = participantUser;
          maleUser = hostUser;
        }

        if (femaleUser) {
          let waliEmail = null;
          let waliName = 'Wali';
          if (femaleUser.waliDetails) {
            try {
              const wd = JSON.parse(femaleUser.waliDetails);
              waliEmail = wd.email || wd.waliEmail || null;
              waliName = wd.name || wd.waliName || 'Wali';
            } catch (e) {
              console.warn('⚠️ Failed to parse waliDetails JSON:', e?.message || e);
            }
          }
          if (!waliEmail && femaleUser.parentGuardianEmail) {
            waliEmail = femaleUser.parentGuardianEmail;
            waliName = femaleUser.parentGuardianName || 'Wali';
          }

          if (waliEmail) {
            const callDetails = {
              callerName: `${hostUser.fname || hostUser.firstName || hostUser.username || 'User'} ${hostUser.lname || hostUser.lastName || ''}`.trim(),
              recipientName: `${participantUser.fname || participantUser.firstName || participantUser.username || 'User'} ${participantUser.lname || participantUser.lastName || ''}`.trim(),
              timestamp: new Date().toISOString(),
              callId: sessionId,
              recordingUrl: null
            };
            const reportLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wali/video-call-report?caller=${hostId}&recipient=${participantId}&callId=${sessionId}`;

            const wardName = `${femaleUser.fname || femaleUser.firstName || femaleUser.username || 'Ward'} ${femaleUser.lname || femaleUser.lastName || ''}`.trim();
            const brotherName = `${maleUser.fname || maleUser.firstName || maleUser.username || 'User'} ${maleUser.lname || maleUser.lastName || ''}`.trim();

            await sendVideoCallNotificationEmail(
              waliEmail,
              waliName,
              wardName,
              brotherName,
              callDetails,
              reportLink
            );
            console.log('📧 Wali email notification sent for professional session');
          } else {
            console.log('ℹ️ No wali email available; skipping Wali notification');
          }
        } else {
          console.log('ℹ️ No female participant identified; Wali notification not required');
        }
      }
    } catch (emailErr) {
      console.error('❌ Error sending Wali notification for professional session:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Professional video session created successfully',
      sessionData: {
        sessionId,
        hostId,
        participantId,
        sessionType: sessionData.sessionType,
        status: 'pending',
        remainingTime: timeCheck.remainingSessionTime
      }
    });

  } catch (error) {
    console.error('❌ Error creating GetStream professional session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create professional video session',
      error: error.message
    });
  }
});

// @desc Initiate GetStream video call
// @route POST /api/getstream-video-call/initiate
// @access Private
const initiateGetStreamCall = asyncHandler(async (req, res) => {
  try {
    const { recipientId, sessionId } = req.body;
    const callerId = req.user._id.toString();

    console.log(`📞 Initiating GetStream video call:`, {
      callerId,
      recipientId,
      sessionId
    });

    // Validate required fields
    if (!recipientId || !sessionId) {
      return res.status(400).json({ message: 'Recipient ID and session ID are required' });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    // Check if caller exists
    const caller = await User.findById(callerId);
    if (!caller) {
      return res.status(404).json({ message: 'Caller not found' });
    }

    // Check time limits
    const timeCheck = await checkTimeLimit(callerId, recipientId);
    if (!timeCheck.canCall) {
      return res.status(403).json({ 
        message: 'Time limit exceeded for video calls with this user',
        remainingTime: timeCheck.remainingTime
      });
    }

    // Check if recipient is online
    const recipientOnline = await isUserOnline(recipientId);
    if (!recipientOnline) {
      return res.status(200).json({
        message: `${recipient.firstName || recipient.username} is offline, he will be notified when he is online`,
        recipientOnline: false
      });
    }

    // Create notification in database
    const notificationData = {
      user: recipientId,
      type: 'getstream_video_call_invitation',
      message: `${caller.firstName || caller.username} is calling you`,
      data: {
        callerId: callerId,
        callerName: caller.firstName || caller.username,
        recipientId: recipientId,
        recipientName: recipient.firstName || recipient.username,
        sessionId: sessionId,
        callId: `call_${sessionId}`,
        timestamp: new Date().toISOString(),
        remainingTime: timeCheck.remainingTime
      },
      createdAt: new Date()
    };

    await Notification.findOneAndUpdate(
      { 
        user: recipientId, 
        type: 'getstream_video_call_invitation',
        'data.sessionId': sessionId 
      },
      notificationData,
      { upsert: true, new: true }
    );

    console.log(`✅ GetStream video call initiated successfully`);

    res.json({
      message: 'GetStream video call invitation sent successfully',
      sessionId,
      callId: `call_${sessionId}`,
      recipientOnline: true,
      remainingTime: timeCheck.remainingTime
    });

  } catch (error) {
    console.error('❌ Error initiating GetStream video call:', error);
    res.status(500).json({ message: 'Failed to initiate video call', error: error.message });
  }
});

// @desc Get active GetStream video call invitations
// @route GET /api/getstream-video-call/invitations
// @access Private
const getActiveInvitations = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id.toString();
    
    console.log(`📋 Fetching active GetStream invitations for user: ${userId}`);

    // Find active video call invitations
    const invitations = await Notification.find({
      user: userId,
      type: 'getstream_video_call_invitation',
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
    }).sort({ createdAt: -1 });

    const activeInvitations = [];

    for (const invitation of invitations) {
      try {
        const callerId = invitation.data?.callerId;
        if (callerId) {
          const caller = await User.findById(callerId);
          if (caller) {
            activeInvitations.push({
              _id: invitation._id,
              callerId: callerId,
              callerName: invitation.data?.callerName || caller.firstName || caller.username,
              sessionId: invitation.data?.sessionId,
              callId: invitation.data?.callId,
              timestamp: invitation.createdAt,
              remainingTime: invitation.data?.remainingTime || 300
            });
          }
        }
      } catch (error) {
        console.error('Error processing invitation:', error);
      }
    }

    console.log(`✅ Found ${activeInvitations.length} active GetStream invitations`);
    res.json(activeInvitations);

  } catch (error) {
    console.error('❌ Error fetching GetStream invitations:', error);
    res.status(500).json({ message: 'Failed to fetch invitations', error: error.message });
  }
});

// @desc Clear GetStream video call notifications
// @route DELETE /api/getstream-video-call/notifications/:sessionId
// @access Private
const clearNotifications = asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();

    console.log(`🧹 Clearing GetStream notifications for session: ${sessionId}, user: ${userId}`);

    // Remove notifications for this session
    const result = await Notification.deleteMany({
      user: userId,
      type: 'getstream_video_call_invitation',
      'data.sessionId': sessionId
    });

    console.log(`✅ Cleared ${result.deletedCount} GetStream notifications`);
    
    res.json({ 
      message: 'Notifications cleared successfully',
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error clearing GetStream notifications:', error);
    res.status(500).json({ message: 'Failed to clear notifications', error: error.message });
  }
});

module.exports = {
  // Modern session-based methods (fresh approach)
  generateSessionToken,
  createProfessionalSession,
  
  // Legacy methods (for backward compatibility)
  generateToken: generateSessionToken, // Alias for compatibility
  initiateGetStreamCall,
  getActiveInvitations,
  clearNotifications
};
