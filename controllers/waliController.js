const User = require('../models/User');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');
const { sendEmail } = require('../utils/emailService');

// @desc    Send video call notification to Wali
// @route   POST /api/wali/video-call-notification
// @access  Private
exports.sendVideoCallNotificationToWali = async (req, res) => {
  try {
    const { recipientId, recipientInfo, status, duration, timestamp } = req.body;
    const userId = req.user._id;

    // Get user's details including plan
    const user = await User.findById(userId).select('waliDetails fname lname username plan');
    if (!user || !user.waliDetails || !user.waliDetails.email) {
      return res.status(400).json({ message: 'Wali details not found' });
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

    // Get recipient details
    const recipient = await User.findById(recipientId).select('fname lname username');
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    const waliDetails = user.waliDetails;
    const callDurationFormatted = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '0:00';
    
    const subject = `Video Call ${status === 'started' ? 'Started' : 'Ended'} - ${user.fname} ${user.lname}`;
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 24px;">🎥 Video Call ${status === 'started' ? 'Started' : 'Ended'}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1e40af; margin-top: 0; font-size: 18px;">Call Details</h2>
            <p><strong>Your Ward:</strong> ${user.fname} ${user.lname} (@${user.username})</p>
            <p><strong>Call Partner:</strong> ${recipient.fname} ${recipient.lname} (@${recipient.username})</p>
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

    // Send email to Wali
    await sendEmail({
      to: waliDetails.email,
      subject: subject,
      html: emailContent,
    });

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
      user: `${user.fname} ${user.lname}`,
      recipient: `${recipient.fname} ${recipient.lname}`,
      duration: callDurationFormatted,
      timestamp
    });

    res.json({ 
      message: `Video call ${status} notification sent to Wali successfully`,
      waliEmail: waliDetails.email
    });
  } catch (error) {
    console.error('Error sending video call notification to Wali:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send message to Wali
// @route   POST /api/wali/message
// @access  Private
exports.sendMessageToWali = async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const userId = req.user._id;

    // Get user's Wali details
    const user = await User.findById(userId).select('waliDetails fname lname username');
    if (!user || !user.waliDetails || !user.waliDetails.email) {
      return res.status(400).json({ message: 'Wali details not found' });
    }

    // Get recipient details
    const recipient = await User.findById(recipientId).select('fname lname username');
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    const waliDetails = user.waliDetails;
    const subject = `New Message from ${user.fname} ${user.lname}`;
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 24px;">💬 New Message</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1e40af; margin-top: 0; font-size: 18px;">Message Details</h2>
            <p><strong>From:</strong> ${user.fname} ${user.lname} (@${user.username})</p>
            <p><strong>To:</strong> ${recipient.fname} ${recipient.lname} (@${recipient.username})</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin-bottom: 20px;">
            <h3 style="color: #0c4a6e; margin-top: 0; font-size: 16px;">Message Content:</h3>
            <p style="margin: 0; color: #0c4a6e; white-space: pre-wrap;">${message}</p>
          </div>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>📧 Islamic Compliance Notice:</strong> This message was sent between your ward and their potential match for transparency and proper supervision.
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

    // Send email to Wali
    await sendEmail({
      to: waliDetails.email,
      subject: subject,
      html: emailContent,
    });

    res.json({ 
      message: 'Message sent to Wali successfully',
      waliEmail: waliDetails.email
    });
  } catch (error) {
    console.error('Error sending message to Wali:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
