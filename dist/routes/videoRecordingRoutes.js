const express = require('express');
const router = express.Router();
const { upload, uploadVideoRecording, downloadVideoRecording, streamVideoRecording, watchVideoRecording } = require('../controllers/videoRecordingController');
const { protect } = require('../middlewares/authMiddleware');

// @desc    Upload video recording and send to Wali
// @route   POST /api/video-recording/upload
// @access  Private
router.post('/upload', protect, upload.single('video'), uploadVideoRecording);

// @desc    Download video recording
// @route   GET /api/video-recording/download/:filename
// @access  Public (with token verification)
router.get('/download/:filename', downloadVideoRecording);

// @desc    Stream video recording (Range support)
// @route   GET /api/video-recording/stream/:filename
// @access  Public (with token verification)
router.get('/stream/:filename', streamVideoRecording);

// @desc    Watch page with embedded player
// @route   GET /api/video-recording/watch/:filename
// @access  Public (with token verification)
router.get('/watch/:filename', watchVideoRecording);

module.exports = router;
