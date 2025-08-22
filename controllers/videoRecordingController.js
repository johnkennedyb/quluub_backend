const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const User = require('../models/User');

// Configure multer for video file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/video-recordings');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `video-call-${timestamp}-${req.body.participantId}.webm`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Upload video recording and notify Wali
const uploadVideoRecording = async (req, res) => {
  try {
    console.log('📹 Processing video recording upload...');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file uploaded'
      });
    }

    const { participantId, participantName, callDuration, callDate } = req.body;
    
    if (!participantId || !participantName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required participant information'
      });
    }

    // Get current user and participant details
    const currentUser = await User.findById(req.user.id);
    const participant = await User.findById(participantId);
    
    if (!currentUser || !participant) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Determine who is female to get Wali details
    let femaleUser = null;
    let maleUser = null;
    
    if (currentUser.gender === 'female') {
      femaleUser = currentUser;
      maleUser = participant;
    } else if (participant.gender === 'female') {
      femaleUser = participant;
      maleUser = currentUser;
    }

    if (!femaleUser || !femaleUser.waliEmail) {
      console.log('⚠️ No female user or Wali email found, skipping Wali notification');
      return res.json({
        success: true,
        message: 'Recording saved successfully (no Wali notification required)',
        filePath: req.file.path
      });
    }

    // Generate download link for the recording
    const downloadLink = `${process.env.BASE_URL || 'http://localhost:5000'}/api/video-calls/download/${path.basename(req.file.filename)}`;
    
    // Prepare email content for Wali
    const emailSubject = `Video Call Recording - ${femaleUser.fname} ${femaleUser.lname}`;
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
            🎥 Video Call Recording Notification
          </h2>
          
          <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #27ae60; font-weight: bold;">
              ✅ Islamic Compliance: Video call supervision as requested
            </p>
          </div>
          
          <h3 style="color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
            Call Details
          </h3>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Female Participant:</td>
              <td style="padding: 8px 0; color: #34495e;">${femaleUser.fname} ${femaleUser.lname}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Male Participant:</td>
              <td style="padding: 8px 0; color: #34495e;">${maleUser.fname} ${maleUser.lname}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Call Date:</td>
              <td style="padding: 8px 0; color: #34495e;">${new Date(callDate).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Duration:</td>
              <td style="padding: 8px 0; color: #34495e;">${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')} minutes</td>
            </tr>
          </table>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #856404;">📹 Video Recording Available</h4>
            <p style="margin: 0; color: #856404;">
              The complete video call has been recorded for your supervision. Please download and review the recording using the link below.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${downloadLink}" 
               style="background-color: #3498db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              📥 Download Video Recording
            </a>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #6c757d; text-align: center;">
              This recording is provided for Islamic compliance and supervision purposes.<br>
              Please keep this recording confidential and secure.<br>
              <strong>Quluub - Islamic Marriage Platform</strong>
            </p>
          </div>
        </div>
      </div>
    `;

    // Send email to Wali
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: femaleUser.waliEmail,
      subject: emailSubject,
      html: emailContent
    };

    await transporter.sendMail(mailOptions);
    
    console.log(`✅ Video recording uploaded and Wali notified: ${femaleUser.waliEmail}`);
    
    res.json({
      success: true,
      message: 'Video recording uploaded and Wali notified successfully',
      filePath: req.file.path,
      downloadLink: downloadLink,
      waliNotified: true,
      waliEmail: femaleUser.waliEmail
    });

  } catch (error) {
    console.error('Error uploading video recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload video recording',
      error: error.message
    });
  }
};

// Download video recording (for Wali access)
const downloadVideoRecording = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../uploads/video-recordings', filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }
    
    // Set appropriate headers for video download
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading video recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download video recording',
      error: error.message
    });
  }
};

module.exports = {
  upload,
  uploadVideoRecording,
  downloadVideoRecording
};
