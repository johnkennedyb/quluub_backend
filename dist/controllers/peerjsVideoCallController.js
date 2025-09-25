const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Notification = require('../models/Notification');

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

  const caller = await User.findById(callerId).select('fname lname');
  const recipient = await User.findById(recipientId);

  if (!caller || !recipient) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const io = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers'); 

  const callData = {
    callerId: callerId.toString(),
    callerName: `${caller.fname} ${caller.lname}`,
    recipientId: recipientId.toString(),
    sessionId: sessionId,
    timestamp: new Date().toISOString(),
  };

  // Check if notification already exists for this session to prevent duplicates
  const existingNotification = await Notification.findOne({
    user: recipientId,
    type: 'video_call_invitation',
    relatedId: sessionId
  });

  if (!existingNotification) {
    await Notification.create({
        user: recipientId,
        type: 'video_call_invitation',
        message: `Incoming video call from ${caller.fname} ${caller.lname}`,
        relatedId: sessionId,
    });
  }

  // Try to send real-time notification if recipient is online
  const recipientKey = recipientId.toString();
  const recipientSocketId = onlineUsers.get(recipientKey);
  // Also check room membership as a reliable backup for online detection
  const recipientRoom = io?.sockets?.adapter?.rooms?.get(recipientKey);
  const recipientOnlineComputed = !!recipientSocketId || (!!recipientRoom && recipientRoom.size > 0);

  // Direct-to-socket delivery (fast path)
  if (recipientSocketId) {
    io.to(recipientSocketId).emit('video_call_invitation', callData);
  }
  // Room-based delivery (backup path)
  try {
    io.to(recipientKey).emit('video_call_invitation', callData);
  } catch (err) {
    // Silent fallback
  }

  // Clear any existing notifications for this session to prevent duplicates
  await Notification.deleteMany({
    user: callerId,
    type: 'video_call_invitation',
    relatedId: sessionId
  });

  // Always return success - caller can proceed with call setup
  res.status(200).json({ 
    message: 'Call invitation sent successfully.', 
    callData,
    recipientOnline: recipientOnlineComputed
  });
});
