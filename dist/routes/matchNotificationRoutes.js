const express = require('express');
const router = express.Router();
const { sendMatchNotifications, getMatchNotificationHistory } = require('../controllers/matchNotificationController');
const { protect } = require('../middlewares/authMiddleware');
const { adminAuth } = require('../middlewares/adminAuth');

// @route   POST /api/admin/match-notifications/send
// @desc    Send match notifications to all premium users
// @access  Private/Admin
router.post('/send', protect, adminAuth, sendMatchNotifications);

// @route   GET /api/admin/match-notifications
// @desc    Get match notification history
// @access  Private/Admin
router.get('/', protect, adminAuth, getMatchNotificationHistory);

module.exports = router;
