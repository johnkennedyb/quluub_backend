const express = require('express');
const {
  getNotifications,
  markAsRead,
  sendGlobalNotification,
  sendCallNotification,
} = require('../controllers/notificationController');
const { protect, isAdmin: admin } = require('../middlewares/auth');

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.post('/send-call-notification', sendCallNotification);

// @desc    Send a global notification
// @route   POST /api/notifications/global
// @access  Private/Admin
router.post('/global', admin, sendGlobalNotification);

module.exports = router;