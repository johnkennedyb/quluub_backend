const express = require('express');
const router = express.Router();
const { upload, uploadVideoRecording, downloadVideoRecording } = require('../controllers/videoRecordingController');
const { protect } = require('../middlewares/auth');

// @desc    Upload video recording and send to Wali
// @route   POST /api/video-recording/upload
// @access  Private
router.post('/upload', protect, upload.single('video'), uploadVideoRecording);

// @desc    Download video recording
// @route   GET /api/video-recording/download/:filename
// @access  Public (with token verification)
router.get('/download/:filename', downloadVideoRecording);

module.exports = router;
