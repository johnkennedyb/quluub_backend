const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Notification = require('../models/Notification');
const VideoCallTime = require('../models/VideoCallTime');

// @desc    Clear video call notifications
// @route   DELETE /api/peerjs-video-call/notifications/:sessionId
// @access  Private
exports.clearVideoCallNotifications = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  try {
    await Notification.deleteMany({
      user: userId,
      type: 'video_call_invitation',
      relatedId: sessionId
    });

    res.status(200).json({ message: 'Video call notifications cleared' });
  } catch (error) {
    console.error('Error clearing video call notifications:', error);
    res.status(500).json({ message: 'Failed to clear notifications' });
  }
});

// @desc    Initiate a PeerJS video call
// @route   POST /api/peerjs-video-call/initiate
// @access  Private
exports.initiatePeerJSCall = asyncHandler(async (req, res) => {
  const { recipientId, sessionId } = req.body;
  const callerId = req.user._id;

  if (!recipientId || !sessionId) {
    res.status(400);
    throw new Error('Recipient ID and Session ID are required');
  }

  const [caller, recipient] = await Promise.all([
    User.findById(callerId).select('fname lname username'),
    User.findById(recipientId).select('isOnline lastSeen') // Only fetch what's needed
  ]);

  if (!caller || !recipient) {
    return res.status(404).json({ message: 'User not found' });
  }

  // --- IMPROVED: Stricter time limit check ---
  try {
    const record = await VideoCallTime.getOrCreatePairRecord(callerId, recipientId);
    if (!record.canMakeVideoCall()) {
      return res.status(403).json({ // Use 403 Forbidden for access denial
        message: 'Video call time limit (5 minutes) has been reached for this match.',
        limitExceeded: true,
        remainingTime: 0,
      });
    }
  } catch (error) {
    console.error('Failed to verify video call time limit:', error);
    // "Fail closed": If the check fails, don't allow the call.
    return res.status(500).json({
      message: 'Could not verify video call time limit. Please try again.',
      limitExceeded: true, // Treat as exceeded
    });
  }

  const io = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers');
  const callerName = `${caller.fname} ${caller.lname}`;

  const callData = {
    callerId: callerId.toString(),
    callerName: callerName,
    recipientId: recipientId.toString(),
    sessionId: sessionId,
  };

  // --- IMPROVED: Create a structured notification ---
  // Use findOneAndUpdate with upsert to prevent creating duplicate notifications for the same call
  await Notification.findOneAndUpdate({
      user: recipientId,
      type: 'video_call_invitation',
      relatedId: sessionId
    }, {
      $set: {
        user: recipientId,
        type: 'video_call_invitation',
        message: `Incoming video call from ${callerName}`,
        relatedId: sessionId,
        data: {
          callerId: callerId,
          callerName: callerName
        }
      }
    }, {
      upsert: true, // Create the notification if it doesn't exist
      new: true
    }
  );

  // --- SIMPLIFIED: Online Status Check and Notification ---
  const recipientKey = recipientId.toString();
  const recipientSocketId = onlineUsers.get(recipientKey);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recipientOnlineComputed = !!recipientSocketId || (recipient.isOnline && recipient.lastSeen >= fiveMinutesAgo);

  console.log(`📞 Video Call Invitation: ${callerName} -> Recipient ${recipientKey}`);

  if (recipientOnlineComputed) {
    // --- SIMPLIFIED: Use room-based delivery. It's the most reliable standard. ---
    // The user's socket should join a room named after their own userId on connection.
    console.log(`  - Attempting delivery to room: ${recipientKey}`);
    io.to(recipientKey).emit('video_call_invitation', callData);
  } else {
    console.log(`  - Recipient ${recipientKey} appears offline. Notification will be available upon next login.`);
  }

  // Clear any existing notifications for this session to prevent duplicates
  await Notification.deleteMany({
    user: callerId,
    type: 'video_call_invitation',
    relatedId: sessionId
  });

  // Always return success to the caller, so they can enter the "calling" state.
  res.status(200).json({
    message: 'Call invitation sent.',
    callData,
    recipientOnline: recipientOnlineComputed
  });
});

// @desc    Get active video call invitations
// @route   GET /api/peerjs-video-call/invitations
// @access  Private
exports.getActiveInvitations = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  try {
    // --- IMPROVED: Fetch the latest invitation using the new structure ---
    // Find the most recent, unread video call invitation within a 30-second window.
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

    const latestInvitation = await Notification.findOne({
      user: userId,
      type: 'video_call_invitation',
      createdAt: { $gte: thirtySecondsAgo }
    }).sort({ createdAt: -1 });

    if (latestInvitation && latestInvitation.data) {
      res.status(200).json({
        hasPendingCall: true,
        invitation: {
          callerName: latestInvitation.data.callerName,
          callerId: latestInvitation.data.callerId,
          sessionId: latestInvitation.relatedId,
          timestamp: latestInvitation.createdAt
        }
      });
    } else {
      res.status(200).json({ hasPendingCall: false });
    }
  } catch (error) {
    console.error('Error fetching active call invitations:', error);
    res.status(500).json({ message: 'Failed to fetch invitations' });
  }
});
