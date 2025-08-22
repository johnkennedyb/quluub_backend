const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendVideoCallNotificationEmail } = require('../utils/emailService');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(notifications);
});

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
// @desc    Send a notification to all users
// @route   POST /api/notifications/global
// @access  Private/Admin
exports.sendGlobalNotification = asyncHandler(async (req, res) => {
  const { title, message, type, target, userIds } = req.body;

  if (!title || !message) {
    res.status(400);
    throw new Error('Title and message are required');
  }

  let users;
  if (userIds && userIds.length > 0) {
    // Send to specific users
    users = await User.find({ '_id': { $in: userIds } }, '_id');
  } else if (target && target !== 'all') {
    // Filter users by subscription plan
    const planFilter = target === 'premium' ? 'premium' : 'freemium';
    users = await User.find({ plan: planFilter }, '_id');
  } else {
    // Send to all users
    users = await User.find({}, '_id');
  }

  if (users.length === 0) {
    res.status(404);
    throw new Error('No users found to send notification to');
  }

  const notifications = users.map(user => ({
    user: user._id,
    type: type || 'admin_announcement',
    message: `${title}: ${message}`,
    read: false,
  }));

  await Notification.insertMany(notifications);

  res.status(201).json({ message: `Notification sent to ${users.length} users.` });
});

// @desc    Send a call notification to a user
// @route   POST /api/notifications/send-call-notification
// @access  Private
exports.sendCallNotification = asyncHandler(async (req, res) => {
  const { recipientId, callData } = req.body;
  
  if (!recipientId || !callData || !callData.meetingUrl) {
    res.status(400);
    throw new Error('Recipient ID and call data with meeting URL are required');
  }

  // Get the recipient user
  const recipient = await User.findById(recipientId);
  if (!recipient) {
    res.status(404);
    throw new Error('Recipient not found');
  }

  // Create notification
  const notification = await Notification.create({
    user: recipientId,
    title: '📞 Incoming Video Call',
    message: `You have an incoming video call from ${callData.callerName || 'a user'}`,
    type: 'video_call',
    data: {
      meetingUrl: callData.meetingUrl,
      meetingId: callData.meetingId,
      timestamp: callData.timestamp || new Date().toISOString()
    },
    read: false
  });

  // Send email notification if recipient has email
  if (recipient.email) {
    try {
      const emailData = {
        to: recipient.email,
        subject: `📞 You have an incoming video call from ${callData.callerName || 'a user'}`,
        template: 'call_notification',
        context: {
          callerName: callData.callerName || 'Someone',
          meetingUrl: callData.meetingUrl,
          recipientName: `${recipient.fname || ''} ${recipient.lname || ''}`.trim() || 'there'
        }
      };

      // Use the correct email function with proper parameters
      await sendVideoCallNotificationEmail(
        recipient.email,
        'Wali', // waliName
        recipient.fname || 'Ward', // wardName  
        callData.callerName || 'Brother', // brotherName
        callData, // callDetails
        callData.meetingUrl // reportLink
      );
      console.log(`📧 Call notification email sent to ${recipient.email}`);
    } catch (emailError) {
      console.error('❌ Failed to send call notification email:', emailError);
      // Don't fail the request if email sending fails
    }
  }

  // Emit real-time notification
  if (req.io) {
    req.io.to(recipientId.toString()).emit('new_notification', notification);
  }

  res.status(200).json({
    success: true,
    message: 'Call notification sent successfully',
    notification
  });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (notification && notification.user.toString() === req.user._id.toString()) {
    notification.read = true;
    await notification.save();
    res.json({ message: 'Notification marked as read' });
  } else {
    res.status(404);
    throw new Error('Notification not found');
  }
});