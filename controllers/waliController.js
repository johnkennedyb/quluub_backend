const jwt = require('jsonwebtoken');
const User = require('../models/User');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');
const { sendEmail } = require('../utils/emailService');
const createEmailHeader = require('../utils/emailTemplates/components/emailHeader');
const createEmailFooter = require('../utils/emailTemplates/components/emailFooter');
const Chat = require('../models/Chat');

// @desc    Send video call notification to Wali
// @route   POST /api/wali/video-call-notification
// @access  Private
exports.sendVideoCallNotificationToWali = async (req, res) => {
  try {
    const { recipientId, recipientInfo, status, duration, timestamp } = req.body;
    const userId = req.user._id;

    // Get user's details including plan
    const user = await User.findById(userId).select('waliDetails fname lname username plan gender');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only premium users can initiate video calls (status === 'started')
    // Free users can join calls initiated by premium users
    if (status === 'started' && (!user.plan || (user.plan !== 'premium' && user.plan !== 'pro'))) {
      return res.status(403).json({ 
        message: 'Only premium users can initiate video calls. Free users can join calls initiated by premium users.',
        code: 'PREMIUM_REQUIRED_FOR_INITIATION'
      });
    }

    // Check monthly video call time limit for this match pair (5 minutes per month)
    if (status === 'started') {
      const timeCheck = await MonthlyCallUsage.getRemainingTime(userId, recipientId);
      if (!timeCheck.hasTimeRemaining) {
        return res.status(403).json({
          message: 'Monthly video call limit reached. You have used all 5 minutes for this month with this match.',
          code: 'MONTHLY_LIMIT_REACHED',
          totalUsedSeconds: timeCheck.totalUsedSeconds,
          monthlyLimitSeconds: timeCheck.monthlyLimitSeconds
        });
      }
    }

    // Get recipient details including wali details
    const recipient = await User.findById(recipientId).select('fname lname username gender waliDetails');
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    // Determine which wali to notify based on Islamic guidelines
    // For video calls, notify the female participant's wali
    let waliDetails = null;
    let wardName = '';
    let partnerName = '';

    if (user.gender === 'female' && user.waliDetails) {
      try {
        waliDetails = JSON.parse(user.waliDetails);
        wardName = `${user.fname} ${user.lname}`;
        partnerName = `${recipient.fname} ${recipient.lname}`;
      } catch (e) {
        console.error('Error parsing user wali details:', e);
      }
    } else if (recipient.gender === 'female' && recipient.waliDetails) {
      try {
        waliDetails = JSON.parse(recipient.waliDetails);
        wardName = `${recipient.fname} ${recipient.lname}`;
        partnerName = `${user.fname} ${user.lname}`;
      } catch (e) {
        console.error('Error parsing recipient wali details:', e);
      }
    }

    // Check if we have valid wali details
    if (!waliDetails || !waliDetails.email) {
      return res.status(400).json({ 
        message: 'Female participant wali details not found or incomplete',
        details: 'Video call notifications require the female participant to have wali email configured'
      });
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
              <strong>📹 Islamic Compliance Notice:</strong> This video call ${status === 'started' ? 'has been initiated' : 'has ended'} between your ward and their potential match. ${status === 'started' ? 'The call is limited to 5 minutes for Islamic compliance.' : 'This notification is sent for transparency and proper supervision.'}
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              This is an automated notification from Quluub - Islamic Marriage Platform<br>
              Ensuring halal connections with proper supervision
            </p>
          </div>
        </div>
      </div>
    `;

    const waliEmailsEnabled = process.env.WALI_VIDEO_EMAILS_ENABLED !== 'false';
    const waliBlocklist = (process.env.WALI_VIDEO_EMAILS_BLOCKLIST || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
    const waliEmailLower = (waliDetails.email || '').toLowerCase();
    const isBlocked = waliBlocklist.includes(waliEmailLower);

    if (!waliEmailsEnabled) {
      console.log('✋ Wali video call emails disabled via WALI_VIDEO_EMAILS_ENABLED=false');
    } else if (isBlocked) {
      console.log(`✋ Suppressing Wali video call email for blocklisted address: ${waliDetails.email}`);
    } else {
      await sendEmail({
        to: waliDetails.email,
        subject: subject,
        html: emailContent,
      });
    }

    // Track video call usage if call ended
    if (status === 'ended' && duration > 0) {
      try {
        await MonthlyCallUsage.addCallDuration(
          userId, 
          recipientId, 
          duration, 
          null, // callId - can be added if available
          userId // initiatedBy
        );
        console.log(`📊 Monthly call usage updated: ${duration} seconds added for users ${userId} and ${recipientId}`);
      } catch (error) {
        console.error('Error updating monthly call usage:', error);
      }
    }

    // Log the video call notification
    console.log(`Video call ${status} notification sent to Wali:`, {
      waliEmail: waliDetails.email,
      ward: wardName,
      partner: partnerName,
      duration: callDurationFormatted,
      timestamp
    });

    res.json({ 
      message: `Video call ${status} notification sent to female participant's Wali successfully`,
      waliEmail: waliDetails.email,
      ward: wardName
    });
  } catch (error) {
    console.error('Error sending video call notification to Wali:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send chat report to parents (every 5 messages)
// @route   Called internally from chatController
// @access  Private
exports.getWaliChatView = async (req, res) => {
  try {
    const { wardId, participantId } = req.params;

    const messages = await Chat.find({
      $or: [
        { senderId: wardId, receiverId: participantId },
        { senderId: participantId, receiverId: wardId },
      ],
    })
      .populate('senderId', 'fname lname')
      .populate('receiverId', 'fname lname')
      .sort({ created: 1 });

    const ward = await User.findById(wardId).select('fname lname');
    const participant = await User.findById(participantId).select('fname lname');

    const chatHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Chat Conversation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f9; color: #333; }
          .chat-container { max-width: 800px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
          .chat-header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
          .chat-header h1 { margin: 0; font-size: 20px; }
          .chat-box { padding: 20px; height: 500px; overflow-y: auto; border-top: 1px solid #ddd; }
          .message { margin-bottom: 15px; display: flex; }
          .message .content { max-width: 70%; padding: 10px 15px; border-radius: 18px; line-height: 1.4; }
          .message.sent { flex-direction: row-reverse; }
          .message.sent .content { background-color: #dcf8c6; align-self: flex-end; }
          .message.received .content { background-color: #f1f1f1; align-self: flex-start; }
          .sender-name { font-size: 0.8em; color: #888; margin-bottom: 4px; }
        </style>
      </head>
      <body>
        <div class="chat-container">
          <div class="chat-header">
            <h1>Chat between ${ward.fname} and ${participant.fname}</h1>
          </div>
          <div class="chat-box">
            ${messages.map(msg => `
              <div class="message ${msg.senderId._id.toString() === wardId ? 'sent' : 'received'}">
                <div class="content">
                  <div class="sender-name">${msg.senderId.fname} ${msg.senderId.lname}</div>
                  ${msg.message}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `;

    res.json({ messages, ward, participant });
  } catch (error) {
    console.error('Error in getWaliChatView:', error);
    res.status(500).json({ message: 'Could not load chat conversation.' });
  }
};

exports.sendChatReportToParents = async (userId, recipientId) => {
  try {
    const user = await User.findById(userId).select('waliDetails fname lname username gender');
    if (!user) {
      console.error('User not found for chat report:', userId);
      return;
    }

    const recipient = await User.findById(recipientId).select('fname lname username gender waliDetails');
    if (!recipient) {
      console.error('Recipient not found for chat report:', recipientId);
      return;
    }

    let waliDetails = null;
    let wardName = '';
    let partnerName = '';

    if (user.gender === 'female' && user.waliDetails) {
      try {
        waliDetails = JSON.parse(user.waliDetails);
        wardName = `${user.fname} ${user.lname}`;
        partnerName = `${recipient.fname} ${recipient.lname}`;
      } catch (e) {
        console.error('Error parsing user wali details:', e);
      }
    } else if (recipient.gender === 'female' && recipient.waliDetails) {
      try {
        waliDetails = JSON.parse(recipient.waliDetails);
        wardName = `${recipient.fname} ${recipient.lname}`;
        partnerName = `${user.fname} ${user.lname}`;
      } catch (e) {
        console.error('Error parsing recipient wali details:', e);
      }
    }

    if (!waliDetails || !waliDetails.email) {
      console.log('No valid wali details found for chat report - skipping notification');
      return;
    }

    const subject = 'Wali Notifications';
    const waliName = waliDetails.name || 'Respected Wali';
    
    // Generate public chat view link for wali
    const wardId = user.gender === 'female' ? userId : recipientId;
    const participantId = user.gender === 'female' ? recipientId : userId;
    // Create a secure token containing conversation details for public access
    const conversationToken = jwt.sign({ 
      wardId, 
      participantId, 
      waliEmail: waliDetails.email,
      type: 'wali_chat_view'
    }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const chatViewLink = `https://match.quluub.com/wali-chat/${conversationToken}`;
    
    const emailContent = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; background-color: #f9f9f9;">
        ${createEmailHeader(subject, waliName)}
        <tr>
          <td align="center" style="padding: 20px;">
            <div style="max-width: 600px; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #1e40af; margin-top: 0; font-size: 18px;">💬 Chat Activity Report</h2>
                <p><strong>Your Ward:</strong> ${wardName}</p>
                <p><strong>Chat Partner:</strong> ${partnerName}</p>
                <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Activity:</strong> Recent chat messages exchanged (every 5 messages)</p>
              </div>
              
              ${chatViewLink ? `
              <div style="text-align: center; margin: 20px 0;">
                <a href="${chatViewLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                  🔍 View Full Conversation
                </a>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                  Click the button above to view the complete conversation between your ward and their match
                </p>
              </div>
              ` : ''}
              
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>📧 Islamic Compliance Notice:</strong> This automated report provides transparency about your ward's chat activity with their potential match for proper supervision.
                </p>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td>
            ${createEmailFooter()}
          </td>
        </tr>
      </table>
    `;

    await sendEmail({
      to: waliDetails.email,
      subject: subject,
      html: emailContent,
    });

    console.log(`Chat report sent to wali: ${waliDetails.email} for ward: ${wardName}`);

  } catch (error) {
    console.error('Error sending chat report to parents:', error);
  }
};
