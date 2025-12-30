const express = require('express');
const router = express.Router();
const { initiatePeerJSCall, clearVideoCallNotifications, getActiveInvitations } = require('../controllers/peerjsVideoCallController');
const { protect } = require('../middlewares/authMiddleware');

// @route   POST /api/peerjs-video-call/initiate
router.post('/initiate', protect, initiatePeerJSCall);

// @route   DELETE /api/peerjs-video-call/notifications/:sessionId
router.delete('/notifications/:sessionId', protect, clearVideoCallNotifications);

// @route   GET /api/peerjs-video-call/invitations
router.get('/invitations', protect, getActiveInvitations);

module.exports = router;
