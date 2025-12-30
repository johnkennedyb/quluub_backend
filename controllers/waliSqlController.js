const jwt = require('jsonwebtoken');
const { sqlQuery } = require('../config/sql');
const userRepo = require('../repositories/userRepository');
const chatRepo = require('../repositories/chatRepository');
const monthlyRepo = require('../repositories/monthlyCallUsageRepository');
const { sendEmail, sendVideoCallNotificationEmail } = require('../utils/emailService');

// @desc Send video call notification to Wali (SQL)
async function sendVideoCallNotificationToWali(req, res) {
  try {
    const { recipientId, recipientInfo, status, duration, timestamp } = req.body;
    const userId = (req.user._id || req.user.id).toString();

    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (status === 'started' && (!user.plan || (user.plan !== 'premium' && user.plan !== 'pro'))) {
      return res.status(403).json({ message: 'Only premium users can initiate video calls. Free users can join calls initiated by premium users.', code: 'PREMIUM_REQUIRED_FOR_INITIATION' });
    }

    if (status === 'started') {
      const timeCheck = await monthlyRepo.getRemainingTime(userId, recipientId);
      if (!timeCheck.hasTimeRemaining) {
        return res.status(403).json({
          message: 'Monthly video call limit reached. You have used all 5 minutes for this month with this match.',
          code: 'MONTHLY_LIMIT_REACHED',
          totalUsedSeconds: timeCheck.totalUsedSeconds,
          monthlyLimitSeconds: timeCheck.monthlyLimitSeconds
        });
      }
    }

    const recipient = await userRepo.findById(recipientId);
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

    let waliDetails = null;
    let wardName = '';
    let partnerName = '';

    const parseWali = (val) => {
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (_) { return null; }
    };

    if (user.gender === 'female' && user.waliDetails) {
      waliDetails = parseWali(user.waliDetails);
      wardName = `${user.fname || ''} ${user.lname || ''}`.trim();
      partnerName = `${recipient.fname || ''} ${recipient.lname || ''}`.trim();
    } else if (recipient.gender === 'female' && recipient.waliDetails) {
      waliDetails = parseWali(recipient.waliDetails);
      wardName = `${recipient.fname || ''} ${recipient.lname || ''}`.trim();
      partnerName = `${user.fname || ''} ${user.lname || ''}`.trim();
    }

    if (!waliDetails || !waliDetails.email) {
      return res.status(400).json({ message: 'Female participant wali details not found or incomplete', details: 'Video call notifications require the female participant to have wali email configured' });
    }

    const callDurationFormatted = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '0:00';
    const subject = 'Wali Notifications';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 24px;">🎥 Video Call ${status === 'started' ? 'Started' : 'Ended'}</h1>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1e40af; margin-top: 0; font-size: 18px;">Call Details</h2>
            <p><strong>Your Ward:</strong> ${wardName}</p>
            <p><strong>Call Partner:</strong> ${partnerName}</p>
            <p><strong>Status:</strong> ${status === 'started' ? 'Call Started' : 'Call Ended'}</p>
            <p><strong>Timestamp:</strong> ${new Date(timestamp).toLocaleString()}</p>
            ${status === 'ended' ? `<p><strong>Duration:</strong> ${callDurationFormatted}</p>` : ''}
          </div>
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>📹 Islamic Compliance Notice:</strong> This video call ${status === 'started' ? 'has been initiated' : 'has ended'} between your ward and their potential match.
            </p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              This is an automated notification from Quluub - Islamic Marriage Platform<br>
              Ensuring halal connections with proper supervision
            </p>
          </div>
        </div>
      </div>`;

    const waliEmailsEnabled = process.env.WALI_VIDEO_EMAILS_ENABLED !== 'false';
    const blocklist = (process.env.WALI_VIDEO_EMAILS_BLOCKLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isBlocked = blocklist.includes((waliDetails.email || '').toLowerCase());

    if (waliEmailsEnabled && !isBlocked) {
      await sendEmail({ to: waliDetails.email, subject, html: emailContent });
    }

    if (status === 'ended' && duration > 0) {
      try {
        await monthlyRepo.addCallDuration(userId, recipientId, duration);
      } catch (err) { /* swallow */ }
    }

    res.json({ message: `Video call ${status} notification sent to female participant's Wali successfully`, waliEmail: waliDetails.email, ward: wardName });
  } catch (error) {
    console.error('Error sending video call notification to Wali (SQL):', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Secure Wali chat monitoring
async function getWaliChatView(req, res) {
  try {
    const { wardId, participantId } = req.params;
    const messages = await chatRepo.getBetweenUsers(wardId.toString(), participantId.toString(), { sort: 'ASC', limit: 10000 });
    const [ward, participant] = await Promise.all([userRepo.findById(wardId), userRepo.findById(participantId)]);
    res.json({ messages, ward, participant });
  } catch (error) {
    console.error('Error in getWaliChatView (SQL):', error);
    res.status(500).json({ message: 'Could not load chat conversation.' });
  }
}

// Public Wali chat viewing via token
async function publicChatView(req, res) {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'wali_chat_view') return res.status(400).json({ message: 'Invalid token type' });
    const { wardId, participantId, waliEmail } = decoded;

    const messages = await chatRepo.getBetweenUsers(wardId.toString(), participantId.toString(), { sort: 'ASC', limit: 10000 });
    const ward = await userRepo.findById(wardId);
    const participant = await userRepo.findById(participantId);
    if (!ward || !participant) return res.status(404).json({ message: 'Users not found' });

    res.json({
      success: true,
      data: messages.map(msg => ({
        message: msg.message,
        sender: msg.senderId === wardId ? `${ward.fname} ${ward.lname}` : `${participant.fname} ${participant.lname}`,
        receiver: msg.receiverId === wardId ? `${ward.fname} ${ward.lname}` : `${participant.fname} ${participant.lname}`,
        timestamp: msg.created,
        senderId: msg.senderId
      })),
      ward: `${ward.fname} ${ward.lname}`,
      wardInfo: { fname: ward.fname, lname: ward.lname, username: ward.username },
      participant: `${participant.fname} ${participant.lname}`,
      waliEmail
    });
  } catch (error) {
    console.error('Error in public wali chat view (SQL):', error);
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' });
    if (error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Wali video call report (HTML)
async function videoCallReport(req, res) {
  try {
    const { callId, platform } = req.query;
    if (!callId) return res.status(400).json({ success: false, message: 'Missing required parameter: callId' });

    const rows = await sqlQuery(
      `SELECT c.*, s.fname AS s_fn, s.lname AS s_ln, s.username AS s_un,
              r.fname AS r_fn, r.lname AS r_ln, r.username AS r_un
       FROM chat c
       JOIN users s ON s.id = c.senderId
       JOIN users r ON r.id = c.receiverId
       WHERE c.message LIKE ?
       ORDER BY c.created DESC`,
      [`%${callId}%`]
    );

    const htmlReport = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Video Call Report - Quluub Wali</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
            .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .call-details { padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; }
            .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
            .detail-item { background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #6f42c1; }
            .detail-label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
            .detail-value { font-size: 16px; color: #333; }
            .recording-section { padding: 20px; border-bottom: 1px solid #dee2e6; }
            .recording-placeholder { background: #fff3e0; border: 2px dashed #ff9800; padding: 30px; text-align: center; border-radius: 8px; color: #e65100; }
            .messages-section { padding: 20px; }
            .message { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #007bff; }
            .message-header { font-weight: bold; color: #333; margin-bottom: 8px; }
            .message-content { color: #666; line-height: 1.5; }
            .timestamp { font-size: 12px; color: #999; margin-top: 8px; }
            .compliance-notice { background: #e8f5e8; padding: 20px; text-align: center; color: #2e7d32; }
            .no-data { text-align: center; color: #666; padding: 40px; font-style: italic; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Video Call Report</h1>
                <p>Wali Supervision Dashboard</p>
            </div>

            <div class="call-details">
                <h2>📞 Call Information</h2>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Call ID</div>
                        <div class="detail-value">${callId}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Platform</div>
                        <div class="detail-value">${platform || 'Whereby'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Report Generated</div>
                        <div class="detail-value">${new Date().toLocaleString()}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Status</div>
                        <div class="detail-value">Under Wali Supervision</div>
                    </div>
                </div>
            </div>

            <div class="recording-section">
                <h2>🎥 Call Recording</h2>
                <div class="recording-placeholder">
                    <h3>📹 Recording Processing</h3>
                    <p>Video call recordings are automatically processed by ${platform || 'Whereby'}'s cloud system.</p>
                    <p>Recordings will be available here once processing is complete.</p>
                    <p><strong>Note:</strong> All recordings are stored securely and accessible only to authorized Wali/guardians.</p>
                </div>
            </div>

            <div class="messages-section">
                <h2>💬 Related Messages</h2>
                ${rows.length === 0
                  ? '<div class="no-data">No messages found for this call.</div>'
                  : rows.map((message) => `
                    <div class="message">
                        <div class="message-header">
                            ${message.s_fn} ${message.s_ln} → ${message.r_fn} ${message.r_ln}
                        </div>
                        <div class="message-content">
                            ${(message.message || '').replace(/\n/g, '<br>')}
                        </div>
                        <div class="timestamp">
                            ${new Date(message.created).toLocaleString()}
                        </div>
                    </div>
                  `).join('')}
            </div>

            <div class="compliance-notice">
                <p><strong>بسم الله الرحمن الرحيم</strong></p>
                <p>This video call report is provided for Islamic compliance and proper supervision purposes.</p>
                <p>All video calls are monitored and recorded to ensure appropriate Islamic conduct.</p>
                <p><small>Quluub - Islamic Marriage Platform | Wali Supervision System</small></p>
            </div>
        </div>
    </body>
    </html>`;

    res.send(htmlReport);
  } catch (error) {
    console.error('❌ Error generating video call report (SQL):', error);
    res.status(500).json({ success: false, message: 'Failed to generate video call report', error: error.message });
  }
}

module.exports = {
  sendVideoCallNotificationToWali,
  getWaliChatView,
  publicChatView,
  videoCallReport,
};
