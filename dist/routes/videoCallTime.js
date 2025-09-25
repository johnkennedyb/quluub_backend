const express = require('express');
const router = express.Router();
const videoCallTimeController = require('../controllers/videoCallTimeController');
const { protect } = require('../middlewares/authMiddleware');

// Get video call time information for a pair
router.get('/info/:userId1/:userId2', protect, videoCallTimeController.getVideoCallTimeInfo);

// Check if users can make a video call
router.get('/can-call/:userId1/:userId2', protect, videoCallTimeController.canMakeVideoCall);

// Start a video call session
router.post('/start-session', protect, videoCallTimeController.startVideoCallSession);

// End a video call session
router.post('/end-session', protect, videoCallTimeController.endVideoCallSession);

// Add call time directly (for existing/completed calls)
router.post('/add-time', protect, videoCallTimeController.addCallTime);

// Get all video call pairs for a user
router.get('/user-pairs/:userId', protect, videoCallTimeController.getUserVideoCallPairs);

// Reset video call time for a pair (admin only)
router.post('/reset', protect, videoCallTimeController.resetVideoCallTime);

module.exports = router;
