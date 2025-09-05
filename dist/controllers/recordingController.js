const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { sendVideoCallNotificationEmail, sendVideoCallNotificationEmailWithAttachments } = require('../utils/emailService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/recordings');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Save as MP4 extension for better compatibility
    const uniqueName = `video-call-${Date.now()}-${uuidv4()}.mp4`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

// Upload video call recording
const uploadRecording = async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No recording file provided' });
    }

    if (!callId) {
      return res.status(400).json({ message: 'Call ID is required' });
    }

    // Generate public URL for the recording (saved as MP4)
    const recordingUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/recordings/${req.file.filename}`;
    
    console.log('📹 Video recording uploaded as MP4:', {
      callId,
      userId,
      filename: req.file.filename,
      size: req.file.size,
      recordingUrl
    });

    // Send MP4 recording to Wali emails with file attachment
    await sendRecordingToWali(userId, callId, recordingUrl, req.file.path);

    res.json({
      message: 'Recording uploaded as MP4 successfully',
      recordingUrl,
      callId,
      filename: req.file.filename,
      fileSize: req.file.size
    });

  } catch (error) {
    console.error('❌ Error uploading recording:', error);
    res.status(500).json({ 
      message: 'Failed to upload recording', 
      error: error.message 
    });
  }
};

// Helper function to send recording to Wali
const sendRecordingToWali = async (userId, callId, recordingUrl, recordingFilePath = null) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Parse call ID to get caller and recipient info
    const [callerId, recipientId] = callId.split('-');
    const [caller, recipient] = await Promise.all([
      User.findById(callerId),
      User.findById(recipientId)
    ]);

    if (!caller || !recipient) return;

    const callDetails = {
      callerName: caller.fname,
      recipientName: recipient.fname,
      timestamp: new Date().toISOString(),
      callId: callId,
      recordingUrl: recordingUrl
    };

    const videoCallReportLink = `${process.env.FRONTEND_URL}/wali/video-call-report?caller=${callerId}&recipient=${recipientId}&callId=${callId}`;

    // Prepare MP4 video recording attachment if file path is provided
    let attachments = [];
    if (recordingFilePath && require('fs').existsSync(recordingFilePath)) {
      attachments = [{
        filename: `video-call-recording-${callId}.mp4`,
        path: recordingFilePath,
        contentType: 'video/mp4'
      }];
      console.log(`📹 MP4 video recording file attached: ${recordingFilePath}`);
    } else {
      console.log('⚠️ No video recording file path provided or file not found, sending link only');
    }

    // Send to caller's wali if female and has wali details
    if (caller.gender === 'female' && caller.waliDetails) {
      try {
        const waliDetails = JSON.parse(caller.waliDetails);
        if (waliDetails.email) {
          if (attachments.length > 0) {
            await sendVideoCallNotificationEmailWithAttachments(
              waliDetails.email,
              waliDetails.name || 'Wali',
              caller.fname,
              recipient.fname,
              callDetails,
              videoCallReportLink,
              attachments
            );
          } else {
            await sendVideoCallNotificationEmail(
              waliDetails.email,
              waliDetails.name || 'Wali',
              caller.fname,
              recipient.fname,
              callDetails,
              videoCallReportLink
            );
          }
          console.log(`📧 Recording ${attachments.length > 0 ? 'with file attachment' : 'with link only'} sent to caller's Wali:`, waliDetails.email);
        }
      } catch (e) {
        console.error('Error parsing wali details for caller:', e);
      }
    }

    // Send to recipient's wali if female and has wali details
    if (recipient.gender === 'female' && recipient.waliDetails) {
      try {
        const waliDetails = JSON.parse(recipient.waliDetails);
        if (waliDetails.email) {
          if (attachments.length > 0) {
            await sendVideoCallNotificationEmailWithAttachments(
              waliDetails.email,
              waliDetails.name || 'Wali',
              recipient.fname,
              caller.fname,
              callDetails,
              videoCallReportLink,
              attachments
            );
          } else {
            await sendVideoCallNotificationEmail(
              waliDetails.email,
              waliDetails.name || 'Wali',
              recipient.fname,
              caller.fname,
              callDetails,
              videoCallReportLink
            );
          }
          console.log(`📧 Recording ${attachments.length > 0 ? 'with file attachment' : 'with link only'} sent to recipient's Wali:`, waliDetails.email);
        }
      } catch (e) {
        console.error('Error parsing wali details for recipient:', e);
      }
    }

  } catch (error) {
    console.error('❌ Error sending recording to Wali:', error);
  }
};

// Serve recording files
const serveRecording = (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads/recordings', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    // Set appropriate headers for MP4 video streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', 'inline');
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Serve entire file
      const head = {
        'Content-Length': fileSize,
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }

  } catch (error) {
    console.error('❌ Error serving recording:', error);
    res.status(500).json({ message: 'Error serving recording' });
  }
};

module.exports = {
  upload,
  uploadRecording,
  serveRecording
};
