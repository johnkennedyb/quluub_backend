const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

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
    // Choose extension based on mimetype (supports webm and mp4)
    const ext = file.mimetype === 'video/mp4' ? '.mp4' : '.webm';
    const filename = `video-call-${timestamp}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/webm', 'video/mp4'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .webm or .mp4 video files are allowed'), false);
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

    let totalDurationSec = 0;
    // Try to fetch duration for better progress reporting
    try {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (!err) {
          totalDurationSec = Number(metadata?.format?.duration || 0) || 0;
        }
      });
    } catch {}

    const parseTimemark = (tm) => {
      if (!tm || typeof tm !== 'string') return 0;
      const parts = tm.split(':'); // HH:MM:SS.xx
      if (parts.length < 3) return 0;
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return h * 3600 + m * 60 + s;
    };

    ffmpeg(inputPath)
      .toFormat('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        // Fast start for progressive download in browsers
        '-movflags', 'faststart',
        // Reasonable encode speed/quality tradeoff
        '-preset', 'fast',
        // Quality target
        '-crf', '23',
        // Max compatibility for older/mobile devices
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'baseline',
        '-level', '3.1',
        // Audio compatibility
        '-ac', '2',
        '-ar', '48000'
      ])
      .on('start', (commandLine) => {
        console.log('🔄 FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        let pct = typeof progress.percent === 'number' ? progress.percent : undefined;
        if (typeof pct !== 'number' && progress.timemark && totalDurationSec > 0) {
          const currentSec = parseTimemark(progress.timemark);
          if (currentSec > 0 && totalDurationSec > 0) {
            pct = (currentSec / totalDurationSec) * 100;
          }
        }
        if (typeof pct === 'number' && isFinite(pct)) {
          console.log(`📹 Conversion progress: ${pct.toFixed(1)}%`);
        } else {
          console.log(`📹 Conversion progress: ${progress.timemark || '...'}`);
        }
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

    // Determine input file path and type
    const inputPath = req.file.path;
    const inputExt = path.extname(inputPath).toLowerCase();
    const publicIdBase = path.basename(inputPath, inputExt);
    if (inputExt === '.webm') {
      webmPath = inputPath;
    }

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
      // Convert to MP4 only if input is webm, otherwise pass-through mp4
      try {
        const mp4PathConverted = inputExt === '.mp4' ? inputPath : await convertToMp4(inputPath);
        mp4Path = mp4PathConverted; // track for cleanup

        const downloadToken = crypto.randomBytes(32).toString('hex');
        const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://quluub-backend-1.onrender.com';
        const frontendUrl = process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_URL || 'https://match.quluub.com';
        const mp4Filename = `${publicIdBase}.mp4`;
        const watchLink = `${frontendUrl}/video-viewer/${mp4Filename}?token=${downloadToken}`;
        const downloadLink = `${backendUrl}/api/video-recording/download/${mp4Filename}?token=${downloadToken}`;

        const hasCloud = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
        if (!hasCloud) {
          console.error('❌ Cloudinary env not set - Cloud-only storage required');
          return res.status(500).json({ success: false, message: 'Cloudinary configuration missing' });
        }

        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        const cloudFolder = process.env.CLOUDINARY_FOLDER || 'quluub/recordings';
        const uploadRes = await cloudinary.uploader.upload(mp4PathConverted, {
          resource_type: 'video',
          folder: cloudFolder,
          public_id: publicIdBase,
          overwrite: true,
        });
        console.log('✅ Uploaded recording to Cloudinary (no-wali branch):', {
          publicId: `${cloudFolder}/${publicIdBase}`,
          secureUrl: uploadRes?.secure_url || null
        });

        return res.json({
          success: true,
          message: 'Recording uploaded to Cloudinary',
          waliNotified: false,
          waliEmail: null,
          watchLink,
          downloadLink,
          filename: mp4Filename,
          cloudinaryUrl: uploadRes?.secure_url || null,
          cloudinaryPublicId: `${cloudFolder}/${publicIdBase}`
        });
      } catch (e) {
        console.error('❌ Cloudinary upload failed:', e);
        return res.status(500).json({ success: false, message: 'Upload to Cloudinary failed', error: e?.message || String(e) });
      }
    }

    // Check if input file has content before processing
    const inputStats = await fs.stat(inputPath);
    if (inputStats.size === 0) {
      console.error('❌ Uploaded video file is empty, cannot process');
      return res.status(400).json({ 
        success: false, 
        message: 'Video file is empty or corrupted' 
      });
    }
    
    console.log(`📹 Processing input file (${inputStats.size} bytes) [ext=${inputExt}]`);
    
    // Convert to MP4 if needed, otherwise pass-through MP4
    const mp4PathConverted = inputExt === '.mp4' ? inputPath : await convertToMp4(inputPath);
    mp4Path = mp4PathConverted; // track mp4 for cleanup
    const hasCloud = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
    if (!hasCloud) {
      console.error('❌ Cloudinary env not set - Cloud-only storage required');
      return res.status(500).json({ success: false, message: 'Cloudinary configuration missing' });
    }
    const cloudFolder = process.env.CLOUDINARY_FOLDER || 'quluub/recordings';
    let uploadRes = null;
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      uploadRes = await cloudinary.uploader.upload(mp4PathConverted, {
        resource_type: 'video',
        folder: cloudFolder,
        public_id: publicIdBase,
        overwrite: true,
      });
      console.log('✅ Uploaded recording to Cloudinary:', {
        publicId: `${cloudFolder}/${publicIdBase}`,
        secureUrl: uploadRes?.secure_url || null
      });
    } catch (e) {
      console.error('❌ Cloudinary upload failed:', e?.message || e);
      return res.status(500).json({ success: false, message: 'Upload to Cloudinary failed', error: e?.message || String(e) });
    }

    const downloadToken = crypto.randomBytes(32).toString('hex');
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://quluub-backend-1.onrender.com';
    const frontendUrl = process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_URL || 'https://match.quluub.com';
    const mp4Filename = `${publicIdBase}.mp4`;
    const watchLink = `${frontendUrl}/video-viewer/${mp4Filename}?token=${downloadToken}`;
    const downloadLink = `${backendUrl}/api/video-recording/download/${mp4Filename}?token=${downloadToken}`;

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
                      The complete video call recording is ready to watch. Click the button below to securely watch the recording online (no download required). If your browser cannot play it, use the fallback download link below.
                    </p>
                    <div style="text-align: center; margin: 15px 0;">
                      <a href="${watchLink}" 
                         style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                        ▶ Watch Video Recording
                      </a>
                    </div>
                    <div style="text-align: center; margin: 8px 0;">
                      <a href="${downloadLink}" 
                         style="display: inline-block; padding: 10px 18px; background-color: #28a745; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 12px;">
                        📥 Fallback: Download Video (MP4)
                      </a>
                    </div>
                    <p style="margin: 15px 0 0 0; color: #856404; font-size: 12px; text-align: center;">
                      <em>These links are secure and private. Please do not share with others.</em>
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
      from: process.env.MAIL_FROM || process.env.EMAIL_USER || 'mail@match.quluub.com',
      to: waliEmail
    });

    // Use the already declared variables from above

    // Use the existing Maileroo service function
    const { sendEmailViaAPI } = require('../utils/mailerooService');
    console.log('📧 Sending email to:', waliEmail);
    console.log('📧 Email subject:', emailSubject);
    console.log('📧 Frontend watch link:', watchLink);
    
    const emailResult = await sendEmailViaAPI(waliEmail, emailSubject, emailContent);
    
    console.log('📧 Email send result:', emailResult);
    
    if (!emailResult) {
      console.error('❌ Email sending failed');
      return res.json({
        success: true,
        message: 'Video processed but email notification failed',
        waliNotified: false,
        waliEmail: waliEmail,
        watchLink,
        downloadLink,
        filename: mp4Filename,
        cloudinaryUrl: uploadRes?.secure_url || null,
        cloudinaryPublicId: uploadRes ? `${cloudFolder}/${publicIdBase}` : null
      });
    }
    
    console.log(`✅ Video recording converted, emailed to Wali: ${waliEmail}`);
    
    res.json({
      success: true,
      message: 'Video recording sent to Wali successfully',
      waliNotified: true,
      waliEmail: waliEmail,
      watchLink,
      downloadLink,
      filename: mp4Filename,
      cloudinaryUrl: uploadRes?.secure_url || null,
      cloudinaryPublicId: uploadRes ? `${cloudFolder}/${publicIdBase}` : null
    });

  } catch (error) {
    console.error('❌ Error processing video recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process video recording',
      error: error.message
    });
  } finally {
    // Cleanup: delete temporary local files (Cloudinary-only storage)
    try {
      if (mp4Path) {
        await fs.unlink(mp4Path).catch(() => {});
        console.log('🧹 Deleted local MP4:', mp4Path);
      }
    } catch (cleanupError) {
      console.warn('⚠️ MP4 cleanup error:', cleanupError?.message || cleanupError);
    }
    try {
      if (webmPath) {
        const fsNode = require('fs');
        if (fsNode.existsSync(webmPath)) {
          await fs.unlink(webmPath).catch(() => {});
          console.log('🧹 Deleted local WEBM:', webmPath);
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ WEBM cleanup error:', cleanupError?.message || cleanupError);
    }
  }
};

// Download video recording with secure token (Cloudinary-only)
const downloadVideoRecording = async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query;

    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      return res.status(500).json({ error: 'Cloud storage not configured' });
    }
    const folder = process.env.CLOUDINARY_FOLDER || 'quluub/recordings';
    const base = path.basename(filename, path.extname(filename));
    const publicId = `${folder}/${base}`;
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      await cloudinary.api.resource(publicId, { resource_type: 'video' });
    } catch (e) {
      const msg = (e && (e.http_code === 404 || e?.error?.message?.includes('not found'))) ? 'Recording not found' : 'Cloudinary check failed';
      const code = msg === 'Recording not found' ? 404 : 502;
      console.warn(`⚠️ ${msg} for download`, { publicId, err: e?.message || String(e) });
      return res.status(code).json({ error: msg });
    }
    const cloudUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`;
    res.setHeader('Cache-Control', 'private, max-age=604800');
    res.setHeader('x-cloudinary-public-id', publicId);
    return res.redirect(cloudUrl);
  } catch (error) {
    console.error('Error downloading video recording:', error);
    res.status(500).json({ error: 'Failed to download video recording' });
  }
};

module.exports = { upload, uploadVideoRecording, downloadVideoRecording };

// Stream video recording (Cloudinary-only, delegate to Cloudinary URL)
const streamVideoRecording = async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query; // reserved for future validation

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      return res.status(500).json({ error: 'Cloud storage not configured' });
    }
    const folder = process.env.CLOUDINARY_FOLDER || 'quluub/recordings';
    const base = path.basename(filename, path.extname(filename));
    const publicId = `${folder}/${base}`;
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      await cloudinary.api.resource(publicId, { resource_type: 'video' });
    } catch (e) {
      const msg = (e && (e.http_code === 404 || e?.error?.message?.includes('not found'))) ? 'Recording not found' : 'Cloudinary check failed';
      const code = msg === 'Recording not found' ? 404 : 502;
      console.warn(`⚠️ ${msg} for stream`, { publicId, err: e?.message || String(e) });
      return res.status(code).json({ error: msg });
    }
    const cloudUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`;
    res.setHeader('Cache-Control', 'private, max-age=604800');
    res.setHeader('x-cloudinary-public-id', publicId);
    return res.redirect(cloudUrl);
  } catch (error) {
    console.error('Error streaming video recording:', error);
    res.status(500).json({ error: 'Failed to stream video recording' });
  }
};

// Simple watch page with HTML5 video player pointing to stream endpoint
const watchVideoRecording = async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query; // pass-through

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).send('Invalid filename');
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';
    const streamUrl = `/api/video-recording/stream/${filename}${token ? `?token=${token}` : ''}`;

    const html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Watch Video Recording</title>
        <style>
          body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol; }
          .container { max-width: 960px; margin: 0 auto; padding: 24px; }
          .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; }
          .header { display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px; }
          .btn { display:inline-block; padding:10px 16px; background:#1d4ed8; color:white; border-radius:8px; text-decoration:none; font-weight:600; }
          video { width: 100%; height: auto; background: black; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Quluub • Video Call Recording</h2>
            <a class="btn" href="/api/video-recording/download/${filename}${token ? `?token=${token}` : ''}">Download</a>
          </div>
          <div class="card">
            <video controls playsinline preload="metadata">
              <source src="${streamUrl}" type="${contentType}">
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </body>
      </html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error rendering watch page:', error);
    res.status(500).send('Failed to render watch page');
  }
};

module.exports.streamVideoRecording = streamVideoRecording;
module.exports.watchVideoRecording = watchVideoRecording;
