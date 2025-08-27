const express = require('express');
const router = express.Router();
const { upload, uploadVideoRecording } = require('../controllers/videoRecordingController');
const { protect } = require('../middlewares/auth');

// @desc    Upload video recording and send to Wali
// @route   POST /api/video-recording/upload
// @access  Private
router.post('/upload', protect, upload.single('video'), uploadVideoRecording);

module.exports = router;
