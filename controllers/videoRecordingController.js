const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const User = require('../models/User');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

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
    const filename = `video-call-${timestamp}.webm`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error('Only .webm video files are allowed'), false);
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

// Helper function to convert video to MP4
const convertToMp4 = (inputPath) => {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace('.webm', '.mp4');
    ffmpeg(inputPath)
      .toFormat('mp4')
      .on('end', () => {
        console.log('✅ Video conversion finished.');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('❌ Error during conversion:', err);
        reject(err);
      })
      .save(outputPath);
  });
};


// Upload video recording, convert, and notify Wali
const uploadVideoRecording = async (req, res) => {
  let webmPath = '';
  let mp4Path = '';

  try {
    console.log('📹 Processing video recording upload...');
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }

    webmPath = req.file.path;
    const { callerId, recipientId } = req.body;
    
    if (!callerId || !recipientId) {
      return res.status(400).json({ success: false, message: 'Missing caller or recipient ID' });
    }

    // Get user details
    const caller = await User.findById(callerId);
    const recipient = await User.findById(recipientId);
    
    if (!caller || !recipient) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Determine who is female to get Wali details
    const femaleUser = caller.gender === 'female' ? caller : recipient;
    const maleUser = caller.gender === 'male' ? caller : recipient;

    if (!femaleUser.waliEmail) {
      console.log('⚠️ No Wali email found, skipping notification.');
      return res.json({ success: true, message: 'Recording saved (no Wali notification required)' });
    }

    // Convert .webm to .mp4
    console.log('🔄 Converting video to MP4...');
    mp4Path = await convertToMp4(webmPath);

    // Prepare email content for Wali
    const emailSubject = `Video Call Recording - ${femaleUser.fname} ${femaleUser.lname}`;
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
            🎥 Video Call Recording Attached
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
              <td style="padding: 8px 0; color: #34495e;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #856404;">📹 Video Recording Attached</h4>
            <p style="margin: 0; color: #856404;">
              The complete video call recording is attached to this email for your supervision.
            </p>
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

    // Send email to Wali with MP4 attachment
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: femaleUser.waliEmail,
      subject: emailSubject,
      html: emailContent,
      attachments: [
        {
          filename: `video-call-${Date.now()}.mp4`,
          path: mp4Path,
          contentType: 'video/mp4'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    
    console.log(`✅ Video recording converted, emailed to Wali: ${femaleUser.waliEmail}`);
    
    res.json({
      success: true,
      message: 'Video recording sent to Wali successfully',
      waliNotified: true,
      waliEmail: femaleUser.waliEmail
    });

  } catch (error) {
    console.error('❌ Error processing video recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process video recording',
      error: error.message
    });
  } finally {
    // Cleanup: delete the temporary .webm and .mp4 files
    try {
      if (webmPath) await fs.unlink(webmPath);
      if (mp4Path) await fs.unlink(mp4Path);
      console.log('🧹 Cleaned up temporary video files.');
    } catch (cleanupError) {
      console.error('❌ Error cleaning up video files:', cleanupError);
    }
  }
};

module.exports = {
  upload,
  uploadVideoRecording,
};
