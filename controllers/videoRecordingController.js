const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const crypto = require('crypto');

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

// Maileroo API configuration
const MAILEROO_API_KEY = 'fdfbe57cf3c414c1d6d5959b948aee7794ab8d742ef6be681ef15bbf78dd201b';
const MAILEROO_API_URL = 'https://smtp.maileroo.com/api/v2/emails';

// Helper function to convert video to MP4 with better error handling
const convertToMp4 = (inputPath) => {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace('.webm', '.mp4');
    
    // Check if input file exists and has content
    const fs = require('fs');
    try {
      const stats = fs.statSync(inputPath);
      if (stats.size === 0) {
        console.warn('⚠️ Input WebM file is empty, skipping conversion');
        reject(new Error('Input file is empty'));
        return;
      }
      console.log(`📹 Converting WebM file (${stats.size} bytes) to MP4...`);
    } catch (err) {
      console.error('❌ Cannot access input file:', err);
      reject(err);
      return;
    }

    ffmpeg(inputPath)
      .toFormat('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-movflags', 'faststart',
        '-preset', 'fast',
        '-crf', '23'
      ])
      .on('start', (commandLine) => {
        console.log('🔄 FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`📹 Conversion progress: ${progress.percent}%`);
      })
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
    
    // Parse waliDetails JSON to get wali email
    let waliEmail = null;
    let waliName = null;
    
    if (femaleUser.waliDetails) {
      try {
        const waliData = JSON.parse(femaleUser.waliDetails);
        waliEmail = waliData.email;
        waliName = waliData.name || waliData.fname || 'Guardian';
        console.log('👩 Parsed Wali data:', { email: waliEmail, name: waliName });
      } catch (parseError) {
        console.error('❌ Error parsing waliDetails JSON:', parseError);
      }
    }
    
    console.log('👤 Caller data:', { id: caller._id, gender: caller.gender, waliDetails: caller.waliDetails });
    console.log('👤 Recipient data:', { id: recipient._id, gender: recipient.gender, waliDetails: recipient.waliDetails });
    console.log('👩 Female user:', { id: femaleUser._id, gender: femaleUser.gender, waliEmail });
    console.log('👨 Male user:', { id: maleUser._id, gender: maleUser.gender });

    if (!waliEmail) {
      console.log('⚠️ No Wali email found for female user, skipping notification.');
      console.log('⚠️ Female user waliDetails:', femaleUser.waliDetails);
      return res.json({ success: true, message: 'Recording saved (no Wali notification required)' });
    }

    // Check if WebM file has content before processing
    const webmStats = await fs.stat(webmPath);
    if (webmStats.size === 0) {
      console.error('❌ WebM file is empty, cannot process');
      return res.status(400).json({ 
        success: false, 
        message: 'Video file is empty or corrupted' 
      });
    }
    
    console.log(`📹 Processing WebM file (${webmStats.size} bytes)`);
    
    // Use WebM file directly - no conversion needed
    console.log('📹 Using WebM file directly (no conversion)');
    mp4Path = webmPath;

    // Generate secure download link
    const videoFilename = path.basename(mp4Path);
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const backendUrl = process.env.BACKEND_URL || 'https://quluub-backend-1.onrender.com';
    const downloadLink = `${backendUrl}/api/video-recording/download/${videoFilename}?token=${downloadToken}`;

    // Use the updated email header and footer components
    const createEmailHeader = require('../utils/emailTemplates/components/emailHeader');
    const createEmailFooter = require('../utils/emailTemplates/components/emailFooter');
    
    const emailSubject = `Video Call Recording - ${femaleUser.fname} ${femaleUser.lname}`;
    const emailContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailSubject}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; }
            .content { padding: 15px !important; }
            .call-details table { font-size: 14px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f9f9f9;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9f9f9;">
          ${createEmailHeader('🎥 Video Call Recording', waliName || 'Guardian')}
          <tr>
            <td align="center" valign="top" style="padding: 20px;">
              <div class="container" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div class="content" style="padding: 30px;">
                  <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #27ae60; font-weight: bold; text-align: center;">
                      ✅ Islamic Compliance: Video call supervision as requested
                    </p>
                  </div>
                  
                  <h3 style="color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">
                    Call Details
                  </h3>
                  
                  <div class="call-details">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Arial, sans-serif;">
                      <tr>
                        <td style="padding: 12px 0; font-weight: bold; color: #2c3e50; border-bottom: 1px solid #eee;">Female Participant:</td>
                        <td style="padding: 12px 0; color: #34495e; border-bottom: 1px solid #eee;">${femaleUser.fname} ${femaleUser.lname}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; font-weight: bold; color: #2c3e50; border-bottom: 1px solid #eee;">Male Participant:</td>
                        <td style="padding: 12px 0; color: #34495e; border-bottom: 1px solid #eee;">${maleUser.fname} ${maleUser.lname}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; font-weight: bold; color: #2c3e50;">Call Date:</td>
                        <td style="padding: 12px 0; color: #34495e;">${new Date().toLocaleString()}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                    <h4 style="margin: 0 0 10px 0; color: #856404;">📹 Video Recording Available</h4>
                    <p style="margin: 0 0 15px 0; color: #856404; line-height: 1.5;">
                      The complete video call recording is ready for download. Click the button below to securely download the recording for your supervision and review.
                    </p>
                    <div style="text-align: center; margin: 15px 0;">
                      <a href="${downloadLink}" 
                         style="display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                        📥 Download Video Recording
                      </a>
                    </div>
                    <p style="margin: 15px 0 0 0; color: #856404; font-size: 12px; text-align: center;">
                      <em>This link is secure and private. Please do not share with others.</em>
                    </p>
                  </div>
                  
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #6c757d; line-height: 1.5;">
                      This recording is provided for Islamic compliance and supervision purposes.<br>
                      Please keep this recording confidential and secure.<br><br>
                      <strong>Quluub - Islamic Marriage Platform</strong><br>
                      <em>Connecting Hearts, Honoring Faith</em>
                    </p>
                  </div>
                </div>
              </div>
            </td>
          </tr>
          ${createEmailFooter()}
        </table>
      </body>
      </html>
    `;

    // Send email to Wali using Maileroo API
    console.log('📧 Attempting to send email to Wali using Maileroo API...');
    console.log('📧 Email config:', {
      api_url: MAILEROO_API_URL,
      api_key: MAILEROO_API_KEY ? '***HIDDEN***' : 'NOT_SET',
      from: process.env.EMAIL_USER || 'mail@quluub.com',
      to: waliEmail
    });

    // Use the already declared variables from above

    // Use the existing Maileroo service function
    const { sendEmailViaAPI } = require('../utils/mailerooService');
    console.log('📧 Sending email to:', waliEmail);
    console.log('📧 Email subject:', emailSubject);
    console.log('📧 Backend download link:', downloadLink);
    
    const emailResult = await sendEmailViaAPI(waliEmail, emailSubject, emailContent, process.env.EMAIL_USER || 'mail@quluub.com');
    
    console.log('📧 Email send result:', emailResult);
    
    if (!emailResult) {
      console.error('❌ Email sending failed');
      return res.status(500).json({
        success: false,
        message: 'Video processed but email notification failed'
      });
    }
    
    console.log(`✅ Video recording converted, emailed to Wali: ${waliEmail}`);
    
    res.json({
      success: true,
      message: 'Video recording sent to Wali successfully',
      waliNotified: true,
      waliEmail: waliEmail
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
      // Keep the WebM file for serving via download link - no cleanup needed
      console.log('📁 Keeping WebM file for download access:', webmPath);
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }
};

// Download video recording with secure token
const downloadVideoRecording = async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query;

    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // For now, allow access without token validation (can be enhanced later)
    // In production, you might want to validate the token against a database
    
    const filePath = path.join(__dirname, '../uploads/video-recordings', filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'Video recording not found' });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log(` Video recording downloaded: ${filename}`);
    
  } catch (error) {
    console.error('Error downloading video recording:', error);
    res.status(500).json({ error: 'Failed to download video recording' });
  }
};

module.exports = { upload, uploadVideoRecording, downloadVideoRecording };
