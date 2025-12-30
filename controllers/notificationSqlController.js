const notificationRepo = require('../repositories/notificationRepository');
const userRepo = require('../repositories/userRepository');
const { sqlQuery } = require('../config/sql');
const { sendVideoCallNotificationEmail } = require('../utils/emailService');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
async function getNotifications(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const notifications = await notificationRepo.listByUser(userId, 200);
    res.json(notifications);
  } catch (e) {
    console.error('Get notifications (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
async function markAsRead(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const id = req.params.id;
    const ok = await notificationRepo.markAsRead(id, userId);
    if (!ok) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (e) {
    console.error('Mark notification read (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
async function deleteNotification(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const id = req.params.id;
    const ok = await notificationRepo.deleteById(id, userId);
    if (!ok) return res.status(404).json({ message: 'Notification not found' });
    res.status(200).json({ message: 'Notification deleted' });
  } catch (e) {
    console.error('Delete notification (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Send a global notification
// @route   POST /api/notifications/global
// @access  Private/Admin
async function sendGlobalNotification(req, res) {
  try {
    const { title, message, type, target, userIds } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });

    let targets = [];
    if (Array.isArray(userIds) && userIds.length) {
      targets = userIds.map(String);
    } else if (target && target !== 'all') {
      const plan = target === 'premium' ? ['premium','pro'] : ['freemium'];
      const rows = await sqlQuery(`SELECT id FROM users WHERE plan IN (${plan.map(()=>'?').join(',')})`, plan);
      targets = rows.map(r => r.id);
    } else {
      const rows = await sqlQuery('SELECT id FROM users');
      targets = rows.map(r => r.id);
    }

    if (!targets.length) return res.status(404).json({ message: 'No users found to send notification to' });

    let count = 0;
    for (const uid of targets) {
      await notificationRepo.createNotification({ userId: uid, title, message: `${title}: ${message}`, type: type || 'admin_announcement' });
      count++;
    }

    res.status(201).json({ message: `Notification sent to ${count} users.` });
  } catch (e) {
    console.error('Send global notification (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Send a call notification to a user
// @route   POST /api/notifications/send-call-notification
// @access  Private
async function sendCallNotification(req, res) {
  try {
    const { recipientId, callData } = req.body;
    if (!recipientId || !callData || !callData.meetingUrl) {
      return res.status(400).json({ message: 'Recipient ID and call data with meeting URL are required' });
    }

    const recipient = await userRepo.findById(recipientId);
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

    const notification = await notificationRepo.createNotification({
      userId: recipientId,
      title: '📞 Incoming Video Call',
      message: `You have an incoming video call from ${callData.callerName || 'a user'}`,
      type: 'video_call',
      data: {
        meetingUrl: callData.meetingUrl,
        meetingId: callData.meetingId,
        timestamp: callData.timestamp || new Date().toISOString(),
      }
    });

    if (recipient.email) {
      try {
        await sendVideoCallNotificationEmail(
          recipient.email,
          'Wali',
          recipient.fname || 'Ward',
          callData.callerName || 'Brother',
          callData,
          callData.meetingUrl
        );
      } catch (emailError) {
        console.error('Failed to send call notification email:', emailError);
      }
    }

    res.status(200).json({ success: true, message: 'Call notification sent successfully', notification });
  } catch (e) {
    console.error('Send call notification (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  deleteNotification,
  sendGlobalNotification,
  sendCallNotification,
};
