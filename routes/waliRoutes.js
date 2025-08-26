const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { waliAuth } = require('../middlewares/waliAuth');
const {
  sendVideoCallNotificationToWali,
  getWaliChatView,
} = require('../controllers/waliController');

const router = express.Router();

// Video call notification to Wali
router.post('/video-call-notification', protect, sendVideoCallNotificationToWali);

// Video call start notification (alias for compatibility)
router.post('/video-call-start', protect, sendVideoCallNotificationToWali);


// Secure Wali chat monitoring route
router.get('/conversation/:wardId/:participantId', waliAuth, getWaliChatView);

// Wali video call report route
router.get('/video-call-report', async (req, res) => {
  try {
    const { callId, platform } = req.query;

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: callId',
      });
    }

    // Find video call related messages
    const videoCallMessages = await Chat.find({
      $or: [
        { message: { $regex: callId, $options: 'i' } },
        { 'metadata.callId': callId },
      ],
    })
      .populate('senderId', 'fname lname username email gender')
      .populate('receiverId', 'fname lname username email gender')
      .sort({ created: -1 });

    // Generate HTML report for video call
    const htmlReport = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Video Call Report - Quluub Wali</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f8f9fa;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .call-details {
                padding: 20px;
                background: #f8f9fa;
                border-bottom: 1px solid #dee2e6;
            }
            .detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            .detail-item {
                background: white;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #6f42c1;
            }
            .detail-label {
                font-weight: bold;
                color: #666;
                font-size: 12px;
                text-transform: uppercase;
                margin-bottom: 5px;
            }
            .detail-value {
                font-size: 16px;
                color: #333;
            }
            .recording-section {
                padding: 20px;
                border-bottom: 1px solid #dee2e6;
            }
            .recording-placeholder {
                background: #fff3e0;
                border: 2px dashed #ff9800;
                padding: 30px;
                text-align: center;
                border-radius: 8px;
                color: #e65100;
            }
            .messages-section {
                padding: 20px;
            }
            .message {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 10px;
                border-left: 4px solid #007bff;
            }
            .message-header {
                font-weight: bold;
                color: #333;
                margin-bottom: 8px;
            }
            .message-content {
                color: #666;
                line-height: 1.5;
            }
            .timestamp {
                font-size: 12px;
                color: #999;
                margin-top: 8px;
            }
            .compliance-notice {
                background: #e8f5e8;
                padding: 20px;
                text-align: center;
                color: #2e7d32;
            }
            .no-data {
                text-align: center;
                color: #666;
                padding: 40px;
                font-style: italic;
            }
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
                ${videoCallMessages.length === 0
                  ? '<div class="no-data">No messages found for this call.</div>'
                  : videoCallMessages.map((message) => `
                    <div class="message">
                        <div class="message-header">
                            ${message.senderId.fname} ${message.senderId.lname} → ${message.receiverId.fname} ${message.receiverId.lname}
                        </div>
                        <div class="message-content">
                            ${message.message.replace(/\n/g, '<br>')}
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
    </html>
    `;

    res.send(htmlReport);
  } catch (error) {
    console.error('❌ Error generating video call report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate video call report',
      error: error.message,
    });
  }
});

module.exports = router;
