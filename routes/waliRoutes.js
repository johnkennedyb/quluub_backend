const express = require('express');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { protect } = require('../middlewares/authMiddleware');
const { sendVideoCallNotificationToWali, sendMessageToWali } = require('../controllers/waliController');

const router = express.Router();

// Video call notification to Wali
router.post('/video-call-notification', protect, sendVideoCallNotificationToWali);

// Video call start notification (alias for compatibility)
router.post('/video-call-start', protect, sendVideoCallNotificationToWali);

// Message notification to Wali
router.post('/message', protect, sendMessageToWali);

// Wali chat monitoring route
router.get('/chat-view', async (req, res) => {
  try {
    const { caller, recipient, callId } = req.query;

    if (!caller || !recipient) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: caller and recipient'
      });
    }

    // Get user details
    const [callerUser, recipientUser] = await Promise.all([
      User.findById(caller).select('fname lname username email gender'),
      User.findById(recipient).select('fname lname username email gender')
    ]);

    if (!callerUser || !recipientUser) {
      return res.status(404).json({
        success: false,
        message: 'Users not found'
      });
    }

    // Get chat history between the two users
    const chatHistory = await Chat.find({
      $or: [
        { senderId: caller, receiverId: recipient },
        { senderId: recipient, receiverId: caller }
      ]
    })
    .populate('senderId', 'fname lname username')
    .populate('receiverId', 'fname lname username')
    .sort({ created: 1 })
    .limit(100); // Limit to last 100 messages

    // Generate HTML report for Wali
    const htmlReport = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wali Chat Monitor - Quluub</title>
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .header p {
                margin: 10px 0 0 0;
                opacity: 0.9;
            }
            .participants {
                display: flex;
                gap: 20px;
                padding: 20px;
                background: #f8f9fa;
                border-bottom: 1px solid #dee2e6;
            }
            .participant {
                flex: 1;
                background: white;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #007bff;
            }
            .participant.female {
                border-left-color: #e91e63;
            }
            .chat-container {
                padding: 20px;
                max-height: 600px;
                overflow-y: auto;
            }
            .message {
                margin-bottom: 15px;
                padding: 12px;
                border-radius: 8px;
                max-width: 70%;
            }
            .message.sent {
                background: #e3f2fd;
                margin-left: auto;
                text-align: right;
            }
            .message.received {
                background: #f1f8e9;
            }
            .message.video-call {
                background: #fff3e0;
                border-left: 4px solid #ff9800;
                max-width: 100%;
                text-align: center;
            }
            .message-header {
                font-weight: bold;
                font-size: 12px;
                color: #666;
                margin-bottom: 5px;
            }
            .message-content {
                word-wrap: break-word;
            }
            .timestamp {
                font-size: 11px;
                color: #999;
                margin-top: 5px;
            }
            .compliance-notice {
                background: #e8f5e8;
                padding: 20px;
                text-align: center;
                color: #2e7d32;
                border-top: 1px solid #dee2e6;
            }
            .no-messages {
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
                <h1>👁️ Wali Chat Monitor</h1>
                <p>Islamic Compliance Supervision</p>
                ${callId ? `<p>Call ID: ${callId}</p>` : ''}
            </div>

            <div class="participants">
                <div class="participant ${callerUser.gender === 'female' ? 'female' : ''}">
                    <h3>👤 ${callerUser.fname} ${callerUser.lname}</h3>
                    <p><strong>Username:</strong> ${callerUser.username}</p>
                    <p><strong>Email:</strong> ${callerUser.email}</p>
                    <p><strong>Gender:</strong> ${callerUser.gender}</p>
                </div>
                <div class="participant ${recipientUser.gender === 'female' ? 'female' : ''}">
                    <h3>👤 ${recipientUser.fname} ${recipientUser.lname}</h3>
                    <p><strong>Username:</strong> ${recipientUser.username}</p>
                    <p><strong>Email:</strong> ${recipientUser.email}</p>
                    <p><strong>Gender:</strong> ${recipientUser.gender}</p>
                </div>
            </div>

            <div class="chat-container">
                ${chatHistory.length === 0 ? 
                  '<div class="no-messages">No messages found between these users.</div>' :
                  chatHistory.map(message => {
                    const isSent = message.senderId._id.toString() === caller;
                    const isVideoCall = message.message.includes('Video Call') || message.message.includes('🎥');
                    
                    return `
                      <div class="message ${isSent ? 'sent' : 'received'} ${isVideoCall ? 'video-call' : ''}">
                        <div class="message-header">
                          ${message.senderId.fname} ${message.senderId.lname} (@${message.senderId.username})
                        </div>
                        <div class="message-content">
                          ${message.message.replace(/\n/g, '<br>')}
                        </div>
                        <div class="timestamp">
                          ${new Date(message.created).toLocaleString()}
                        </div>
                      </div>
                    `;
                  }).join('')
                }
            </div>

            <div class="compliance-notice">
                <p><strong>بسم الله الرحمن الرحيم</strong></p>
                <p>This chat monitoring is provided for Islamic compliance and proper supervision purposes.</p>
                <p>All conversations are monitored to ensure appropriate Islamic conduct.</p>
                <p><small>Generated on: ${new Date().toLocaleString()}</small></p>
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(htmlReport);

  } catch (error) {
    console.error('❌ Error generating Wali chat view:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate chat view',
      error: error.message
    });
  }
});

// Wali video call report route
router.get('/video-call-report', async (req, res) => {
  try {
    const { callId, platform } = req.query;

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: callId'
      });
    }

    // Find video call related messages
    const videoCallMessages = await Chat.find({
      $or: [
        { message: { $regex: callId, $options: 'i' } },
        { 'metadata.callId': callId }
      ]
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
                ${videoCallMessages.length === 0 ? 
                  '<div class="no-data">No messages found for this call.</div>' :
                  videoCallMessages.map(message => `
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
                  `).join('')
                }
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
      error: error.message
    });
  }
});

module.exports = router;
