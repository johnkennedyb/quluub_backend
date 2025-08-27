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

// Email transporter setup - Using Maileroo SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.maileroo.com',
  port: process.env.SMTP_PORT || 465,
  secure: true, // Use SSL
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
    console.log('👤 Caller data:', { id: caller._id, gender: caller.gender, waliEmail: caller.waliEmail });
    console.log('👤 Recipient data:', { id: recipient._id, gender: recipient.gender, waliEmail: recipient.waliEmail });
    
    const femaleUser = caller.gender === 'female' ? caller : recipient;
    const maleUser = caller.gender === 'male' ? caller : recipient;
    
    console.log('👩 Female user:', { id: femaleUser._id, gender: femaleUser.gender, waliEmail: femaleUser.waliEmail });
    console.log('👨 Male user:', { id: maleUser._id, gender: maleUser.gender });

    if (!femaleUser.waliEmail) {
      console.log('⚠️ No Wali email found for female user, skipping notification.');
      console.log('⚠️ Female user full data:', JSON.stringify(femaleUser, null, 2));
      return res.json({ success: true, message: 'Recording saved (no Wali notification required)' });
    }

    // Try to convert .webm to .mp4, fallback to original if conversion fails
    console.log('🔄 Attempting to convert video to MP4...');
    try {
      mp4Path = await convertToMp4(webmPath);
      console.log('✅ Video converted to MP4 successfully');
    } catch (conversionError) {
      console.warn('⚠️ FFmpeg conversion failed, using original WebM file:', conversionError.message);
      mp4Path = webmPath; // Use original WebM file
    }

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
          ${createEmailHeader('🎥 Video Call Recording', femaleUser.waliName || 'Guardian')}
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
                    <h4 style="margin: 0 0 10px 0; color: #856404;">📹 Video Recording Attached</h4>
                    <p style="margin: 0; color: #856404; line-height: 1.5;">
                      The complete video call recording is attached to this email for your supervision and review.
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

    // Send email to Wali with MP4 attachment
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: femaleUser.waliEmail,
      subject: emailSubject,
      html: emailContent,
      attachments: [
        {
          filename: `video-call-${Date.now()}${mp4Path.endsWith('.mp4') ? '.mp4' : '.webm'}`,
          path: mp4Path,
          contentType: mp4Path.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
        }
      ]
    };

    console.log('📧 Attempting to send email to Wali...');
    console.log('📧 Email config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.EMAIL_USER,
      to: femaleUser.waliEmail
    });
    
    const emailResult = await transporter.sendMail(mailOptions);
    console.log('📧 Email send result:', emailResult);
    
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
