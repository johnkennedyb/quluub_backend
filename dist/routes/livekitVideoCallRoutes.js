const express = require('express');
const router = express.Router();
const {
  clearLivekitVideoCallNotifications,
  initiateLivekitCall,
  getActiveLivekitInvitations,
  acceptLivekitCall
} = require('../controllers/livekitVideoCallController');
const { protect } = require('../middlewares/authMiddleware');

// @desc    Clear LiveKit video call notifications
// @route   DELETE /api/livekit-video-call/notifications/:sessionId
// @access  Private
router.delete('/notifications/:sessionId', protect, clearLivekitVideoCallNotifications);

// @desc    Initiate a LiveKit video call
// @route   POST /api/livekit-video-call/initiate
// @access  Private
router.post('/initiate', protect, initiateLivekitCall);

// @desc    Get active LiveKit video call invitations
// @route   GET /api/livekit-video-call/invitations
// @access  Private
router.get('/invitations', protect, getActiveLivekitInvitations);

// @desc    Accept LiveKit video call
// @route   POST /api/livekit-video-call/accept
// @access  Private
router.post('/accept', protect, acceptLivekitCall);

module.exports = router;
