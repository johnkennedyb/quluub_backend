const express = require('express');
const router = express.Router();
const {
  generateSessionToken,
  createProfessionalSession,
  generateToken,
  initiateGetStreamCall,
  getActiveInvitations,
  clearNotifications
} = require('../controllers/getstreamVideoCallController');
const { protect } = require('../middlewares/authMiddleware');

// Modern session-based routes (fresh approach)
// @desc Generate GetStream session token for professional video
// @route POST /api/getstream-video-call/token
// @access Private
router.post('/token', protect, generateSessionToken);

// @desc Create GetStream professional video session
// @route POST /api/getstream-video-call/create-session
// @access Private
router.post('/create-session', protect, createProfessionalSession);

// Legacy routes (for backward compatibility)
// @desc Initiate GetStream video call (legacy)
// @route POST /api/getstream-video-call/initiate
// @access Private
router.post('/initiate', protect, initiateGetStreamCall);

// @desc Get active GetStream video call invitations
// @route GET /api/getstream-video-call/invitations
// @access Private
router.get('/invitations', protect, getActiveInvitations);

// @desc Clear GetStream video call notifications
// @route DELETE /api/getstream-video-call/notifications/:sessionId
// @access Private
router.delete('/notifications/:sessionId', protect, clearNotifications);

module.exports = router;
