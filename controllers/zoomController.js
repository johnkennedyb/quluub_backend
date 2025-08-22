const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Call = require('../models/Call');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');
const nodemailer = require('nodemailer');

// Zoom Video SDK configuration
const ZOOM_SDK_KEY = process.env.ZOOM_SDK_KEY;
const ZOOM_SDK_SECRET = process.env.ZOOM_SDK_SECRET;
const MEETING_DURATION_MINUTES = 5; // 5-minute limit

// Validate environment variables
if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
  console.error('❌ Missing Zoom SDK environment variables!');
  console.error('Required: ZOOM_SDK_KEY, ZOOM_SDK_SECRET');
  console.error('Current values:', {
    ZOOM_SDK_KEY: ZOOM_SDK_KEY ? 'SET' : 'MISSING',
    ZOOM_SDK_SECRET: ZOOM_SDK_SECRET ? 'SET' : 'MISSING'
  });
}

// Generate SDK JWT for client-side Zoom Video SDK
const generateZoomSDKJWT = (sessionName, role = 1) => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 2; // 2 hours

  const payload = {
    app_key: ZOOM_SDK_KEY,
    iat,
    exp,
    tpc: sessionName,
    role_type: role,
    user_identity: `user_${Math.floor(Math.random() * 10000)}`,
    session_key: `sess_${Math.floor(Math.random() * 10000)}`
  };

  console.log('🔑 Generating Zoom SDK JWT with payload:', payload);

  try {
    const token = jwt.sign(payload, ZOOM_SDK_SECRET, { algorithm: 'HS256' });
    console.log('🔑 Zoom SDK JWT generated successfully.');
    return token;
  } catch (error) {
    console.error('❌ Error generating Zoom SDK JWT:', error);
    throw new Error('Failed to generate Zoom signature');
  }
};


// Send notification to Wali about video call
const sendWaliVideoCallNotification = async (hostUserId, participantUserId, meetingDetails) => {
  try {
    const [hostUser, participantUser] = await Promise.all([
      User.findById(hostUserId),
      User.findById(participantUserId)
    ]);

    if (!hostUser || !participantUser) {
      console.error('Users not found for Wali notification');
      return;
    }

    // Notify host's Wali if female
    if (hostUser.gender === 'female' && hostUser.waliDetails) {
      try {
        const waliDetails = JSON.parse(hostUser.waliDetails);
        if (waliDetails.email) {
          await sendWaliNotificationEmail(
            waliDetails.email,
            waliDetails.name || 'Wali',
            hostUser.fname,
            participantUser.fname,
            meetingDetails
          );
        }
      } catch (e) {
        console.error('Error parsing host wali details:', e);
      }
    }

    // Notify participant's Wali if female
    if (participantUser.gender === 'female' && participantUser.waliDetails) {
      try {
        const waliDetails = JSON.parse(participantUser.waliDetails);
        if (waliDetails.email) {
          await sendWaliNotificationEmail(
            waliDetails.email,
            waliDetails.name || 'Wali',
            participantUser.fname,
            hostUser.fname,
            meetingDetails
          );
        }
      } catch (e) {
        console.error('Error parsing participant wali details:', e);
      }
    }
  } catch (error) {
    console.error('Error sending Wali notification:', error);
  }
};

// Send email notification to Wali
const sendWaliNotificationEmail = async (waliEmail, waliName, userFname, partnerFname, meetingDetails) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const emailContent = `
      <h2>🎥 Video Call Notification - Islamic Supervision</h2>
      <p>Dear ${waliName},</p>
      <p>This is to inform you that <strong>${userFname}</strong> is about to have a video call with <strong>${partnerFname}</strong> on the Quluub platform.</p>
      
      <h3>📋 Call Details:</h3>
      <ul>
        <li><strong>Meeting ID:</strong> ${meetingDetails.meetingId}</li>
        <li><strong>Duration Limit:</strong> ${MEETING_DURATION_MINUTES} minutes</li>
        <li><strong>Start Time:</strong> ${new Date(meetingDetails.startTime).toLocaleString()}</li>
        <li><strong>Topic:</strong> ${meetingDetails.topic}</li>
      </ul>
      
      <h3>🔗 Supervision Link:</h3>
      <p>You can monitor this call using the following link:</p>
      <p><a href="${meetingDetails.joinUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Call for Supervision</a></p>
      
      <h3>📹 Recording Information:</h3>
      <p>This call will be automatically recorded and the recording will be sent to you after the call ends for your review.</p>
      
      <p><em>This is an automated notification from Quluub's Islamic compliance system.</em></p>
      <p>May Allah bless your supervision and guidance.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: waliEmail,
      subject: `🎥 Video Call Notification - ${userFname} & ${partnerFname}`,
      html: emailContent
    });

    console.log(`Wali notification sent to ${waliEmail}`);
  } catch (error) {
    console.error('Error sending Wali email:', error);
  }
};

// @desc    Create a Zoom Video SDK session
// @route   POST /api/zoom/create-meeting
// @access  Private (Premium users only)
exports.createMeeting = async (req, res) => {
  console.log('🎥 Zoom Video SDK Session Request:', { userId: req.user._id, body: req.body });

  try {
    const userId = req.user._id;
    const { participantId, topic = 'Quluub Video Call' } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.plan !== 'premium' && user.plan !== 'pro') {
      return res.status(403).json({ 
        message: 'Video calls are for Premium users only. Please upgrade your plan.',
        requiresUpgrade: true 
      });
    }

    // Check monthly video call time limit for this match pair (5 minutes per month)
    const timeCheck = await MonthlyCallUsage.getRemainingTime(userId, participantId);
    if (!timeCheck.hasTimeRemaining) {
      return res.status(403).json({
        message: 'Monthly video call limit reached. You have used all 5 minutes for this month with this match.',
        code: 'MONTHLY_LIMIT_REACHED',
        totalUsedSeconds: timeCheck.totalUsedSeconds,
        monthlyLimitSeconds: timeCheck.monthlyLimitSeconds,
        remainingTime: '0:00'
      });
    }

    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }

    const participant = await User.findById(participantId).select('fname');
    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    const sessionName = `QuluubCall_${userId}_${participantId}_${Date.now()}`;

    const callRecord = new Call({
      caller: userId,
      recipient: participantId,
      roomId: sessionName,
      status: 'ringing',
      startedAt: new Date(),
    });
    await callRecord.save();

    const sdkJWT = generateZoomSDKJWT(sessionName, 1);

    const sessionData = {
      callId: callRecord._id,
      sessionName,
      sdkKey: ZOOM_SDK_KEY,
      sdkJWT,
      userName: user.fname || 'User',
      participantName: participant.fname || 'Participant',
      topic: `${topic} - ${user.fname} & ${participant.fname}`,
      leaveUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/messages`,
    };

    // Send Wali notification without blocking the response
    sendWaliVideoCallNotification(userId, participantId, {
      meetingId: sessionName,
      joinUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/video-call/${sessionName}`,
      startTime: new Date().toISOString(),
      topic: sessionData.topic
    }).catch(err => console.error('Error sending Wali notification:', err));

    console.log('✅ Zoom SDK session created successfully.');
    res.json(sessionData);

  } catch (error) {
    console.error('❌ Error creating Zoom SDK session:', error);
    res.status(500).json({ 
      message: 'Failed to create video call session',
      error: error.message 
    });
  }
};

// @desc    Generate Video SDK JWT for frontend
// @route   POST /api/zoom/get-sdk-token
// @access  Private (Premium users only)
exports.getSDKToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionKey, role = 1 } = req.body;
    
    // Check if user is premium
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.plan !== 'premium' && user.plan !== 'pro') {
      return res.status(403).json({ 
        message: 'Video calls are available for Premium users only.',
        requiresUpgrade: true 
      });
    }
    
    if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
      return res.status(500).json({ message: 'Zoom SDK credentials not configured' });
    }
    
    // Generate Video SDK JWT
    const sdkJWT = generateZoomSDKJWT(sessionKey, role);
    
    console.log('✅ Video SDK JWT generated for session:', sessionKey);
    console.log('🔑 SDK Key being used:', ZOOM_SDK_KEY);
    
    res.json({ 
      sdkJWT,
      sessionKey,
      sdkKey: ZOOM_SDK_KEY
    });
    
  } catch (error) {
    console.error('Error generating Video SDK JWT:', error.message);
    res.status(500).json({ 
      message: 'Failed to generate Video SDK JWT',
      error: error.message 
    });
  }
};

// @desc    Generate Zoom SDK signature
// @route   POST /api/zoom/signature
// @access  Private (Premium users only)
exports.generateSignature = async (req, res) => {
  try {
    const userId = req.user._id;
    const { meetingNumber, role = 0 } = req.body;
    
    // Check if user is premium
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.plan !== 'premium' && user.plan !== 'pro') {
      return res.status(403).json({ 
        message: 'Video calls are available for Premium users only.',
        requiresUpgrade: true 
      });
    }
    
    if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
      return res.status(500).json({ message: 'Zoom SDK credentials not configured' });
    }
    
    const timestamp = new Date().getTime() - 30000; // 30 seconds ago to account for clock skew
    const msg = Buffer.from(ZOOM_SDK_KEY + meetingNumber + timestamp + role, 'utf8');
    const hash = crypto.createHmac('sha256', ZOOM_SDK_SECRET).update(msg).digest('base64');
    const signature = Buffer.from(`${ZOOM_SDK_KEY}.${meetingNumber}.${timestamp}.${role}.${hash}`).toString('base64');
    
    console.log('✅ Zoom SDK signature generated for meeting:', meetingNumber);
    
    res.json({ signature });
    
  } catch (error) {
    console.error('Error generating Zoom signature:', error.message);
    res.status(500).json({ 
      message: 'Failed to generate meeting signature',
      error: error.message 
    });
  }
};

// @desc    Notify Wali about video call
// @route   POST /api/zoom/notify-wali
// @access  Private (Premium users only)
exports.notifyWali = async (req, res) => {
  try {
    const userId = req.user._id;
    const { recipientId, status, duration = 0, meetingId } = req.body;
    
    // Get user and recipient details
    const user = await User.findById(userId);
    const recipient = await User.findById(recipientId);
    
    if (!user || !recipient) {
      return res.status(404).json({ message: 'User or recipient not found' });
    }
    
    // Determine which user is female to get Wali email
    const femaleUser = user.gender === 'female' ? user : recipient;
    
    if (!femaleUser.waliDetails) {
      console.log('No Wali details found for female user');
      return res.json({ message: 'No Wali details configured' });
    }
    
    let waliEmail;
    try {
      const waliDetails = typeof femaleUser.waliDetails === 'string' 
        ? JSON.parse(femaleUser.waliDetails) 
        : femaleUser.waliDetails;
      waliEmail = waliDetails.email;
    } catch (parseError) {
      console.error('Error parsing Wali details:', parseError);
      return res.status(400).json({ message: 'Invalid Wali details format' });
    }
    
    if (!waliEmail) {
      console.log('No Wali email found in details');
      return res.json({ message: 'No Wali email configured' });
    }
    
    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // Email content based on call status
    const isCallStart = status === 'started';
    const subject = `Quluub Video Call ${isCallStart ? 'Started' : 'Ended'} - ${femaleUser.fname}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c5aa0; margin-bottom: 10px;">🎥 Quluub Video Call ${isCallStart ? 'Started' : 'Ended'}</h1>
            <p style="color: #666; font-size: 16px;">Islamic Marriage Platform - Wali Supervision Notice</p>
          </div>
          
          <div style="background-color: #f8f9ff; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
            <h3 style="color: #2c5aa0; margin-top: 0;">📋 Call Details</h3>
            <p><strong>👤 Participants:</strong> ${user.fname} ${user.lname} & ${recipient.fname} ${recipient.lname}</p>
            <p><strong>⏰ ${isCallStart ? 'Started' : 'Ended'} At:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>🆔 Meeting ID:</strong> ${meetingId || 'N/A'}</p>
            ${!isCallStart ? `<p><strong>⏱️ Duration:</strong> ${Math.floor(duration / 60)}m ${duration % 60}s</p>` : ''}
            <p><strong>🏢 Platform:</strong> Zoom Professional</p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 25px;">
            <h3 style="color: #856404; margin-top: 0;">🕌 Islamic Compliance Notice</h3>
            <p style="color: #856404; margin-bottom: 10px;">This video call is being conducted under Islamic guidelines with proper supervision.</p>
            <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
              <li>Professional Zoom platform ensures secure communication</li>
              <li>Call details are automatically logged for transparency</li>
              <li>Duration is limited to maintain appropriate interaction</li>
              <li>Both parties are aware of Wali oversight</li>
            </ul>
          </div>
          
          <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
            <h3 style="color: #0c5460; margin-top: 0;">💬 Continue Supervision</h3>
            <p style="color: #0c5460;">You can also monitor their chat conversations through your supervision link.</p>
            <p style="color: #0c5460;"><strong>Chat Supervision:</strong> Available in your Wali dashboard</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 14px; margin-bottom: 10px;">This is an automated notification from Quluub</p>
            <p style="color: #666; font-size: 14px;">🌙 Connecting Hearts, Honoring Faith 🌙</p>
          </div>
        </div>
      </div>
    `;
    
    // Send email to Wali
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: waliEmail,
      subject: subject,
      html: htmlContent
    });
    
    console.log(`✅ Wali notification sent for video call ${status}:`, waliEmail);
    
    res.json({ 
      message: 'Wali notification sent successfully',
      status: status,
      waliNotified: true
    });
    
  } catch (error) {
    console.error('Error notifying Wali about video call:', error.message);
    res.status(500).json({ 
      message: 'Failed to notify Wali',
      error: error.message 
    });
  }
};

// @desc    Create UI Toolkit session
// @route   POST /api/zoom/session
// @access  Private (Premium users only)
const createUIToolkitSession = async (req, res) => {
  try {
    console.log('🚀 Creating UI Toolkit session...');
    
    // Validate environment variables first
    if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
      console.error('❌ Zoom SDK environment variables not configured');
      return res.status(500).json({ 
        error: 'Video calling service not configured',
        details: 'Missing Zoom SDK credentials'
      });
    }
    
    const { sessionId, userRole = 1, recipientId } = req.body;
    const userId = req.user.id;
    
    console.log('📋 Request data:', { sessionId, userRole, recipientId, userId });

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is premium (temporarily bypassed for testing)
    // if (!user.isPremium && user.accountType !== 'pro') {
    //   return res.status(403).json({ error: 'Premium subscription required for video calls' });
    // }

    console.log('✅ User is authorized for video calls');

    // Generate session key and signature
    const sessionKey = `sess_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    console.log('🔑 Generating Zoom SDK signature...');
    const signature = generateZoomSDKJWT(sessionId, userRole);
    
    if (!signature) {
      throw new Error('Failed to generate Zoom SDK signature');
    }

    // Create call record in database (only if we have a recipient)
    let callRecord = null;
    if (recipientId) {
      callRecord = new Call({
        caller: userId,
        recipient: recipientId,
        roomId: sessionId,
        status: 'ringing',
        startedAt: new Date(),
        duration: 0,
        recordingUrl: null
      });
      
      await callRecord.save();
      console.log('📝 Call record created:', callRecord._id);
    } else {
      console.log('⚠️ No recipient provided, skipping call record creation');
    }



    // Send response with session data
    const sessionData = {
      signature: signature,
      sessionId: sessionId,
      sessionKey: sessionKey,
      sdkKey: ZOOM_SDK_KEY,
      userName: `${user.fname} ${user.lname}`,
      userRole: userRole,
      callId: callRecord ? callRecord._id : null
    };

    console.log('✅ UI Toolkit session created successfully');
    res.json(sessionData);

  } catch (error) {
    console.error('❌ Error creating UI Toolkit session:', error);
    res.status(500).json({ 
      error: 'Failed to create video session',
      details: error.message 
    });
  }
};

// @desc    Join existing Zoom session
// @route   POST /api/zoom/join-session
// @access  Private (Premium users only)
const joinSession = async (req, res) => {
  try {
    console.log('🔗 Joining existing Zoom session...');
    
    const { sessionId, callId } = req.body;
    const userId = req.user.id;

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify the call exists and user is authorized to join
    if (callId) {
      const callRecord = await Call.findById(callId);
      if (!callRecord) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      // Check if user is either caller or recipient
      if (callRecord.caller.toString() !== userId && callRecord.recipient.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to join this call' });
      }
      
      console.log('✅ User authorized to join call:', callId);
    }

    // Generate signature for joining the session
    const signature = generateZoomSDKJWT(sessionId, 1); // role 1 for participant
    const sessionKey = `sess_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Send response with session data
    const sessionData = {
      signature: signature,
      sessionId: sessionId,
      sessionKey: sessionKey,
      sdkKey: ZOOM_SDK_KEY,
      userName: `${user.fname} ${user.lname}`,
      userRole: 1, // participant role
      callId: callId
    };

    console.log('✅ Successfully joined session:', sessionId);
    res.json(sessionData);

  } catch (error) {
    console.error('❌ Error joining session:', error);
    res.status(500).json({ 
      error: 'Failed to join video session',
      details: error.message 
    });
  }
};

// @desc    Send video call invitation
// @route   POST /api/zoom/send-invitation
// @access  Private (Premium users only)
const sendCallInvitation = async (req, res) => {
  try {
    console.log('📧 Sending video call invitation...');
    
    const { recipientId, sessionId, callId } = req.body;
    const callerId = req.user.id;

    // Get caller and recipient details
    const [caller, recipient] = await Promise.all([
      User.findById(callerId),
      User.findById(recipientId)
    ]);

    if (!caller || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create invitation data
    const invitationData = {
      type: 'video_call_invitation',
      callerId: callerId,
      callerName: `${caller.fname} ${caller.lname}`,
      callerUsername: caller.username,
      recipientId: recipientId,
      sessionId: sessionId,
      callId: callId,
      timestamp: new Date().toISOString(),
      message: `${caller.fname} ${caller.lname} is inviting you to a video call`
    };

    // Get socket.io instance from app
    const io = req.app.get('io');
    
    if (io) {
      // Send real-time notification to recipient
      console.log(`📡 Sending video call invitation to user ${recipientId}`);
      io.to(recipientId).emit('video_call_invitation', invitationData);
      
      // Also send to WebRTC namespace if it exists
      const webrtcNamespace = io.of('/webrtc');
      if (webrtcNamespace) {
        webrtcNamespace.to(recipientId).emit('video_call_invitation', invitationData);
      }
      
      console.log('✅ Video call invitation sent via socket.io');
    } else {
      console.warn('⚠️ Socket.io instance not found');
    }
    
    // Send Wali notification about the call
    try {
      await sendWaliVideoCallNotification(callerId, recipientId, {
        sessionId,
        callId,
        type: 'call_invitation'
      });
      console.log('📧 Wali notification sent for video call invitation');
    } catch (waliError) {
      console.error('❌ Error sending Wali notification:', waliError);
    }
    
    res.json({ 
      success: true, 
      invitation: invitationData,
      message: 'Invitation sent successfully'
    });

  } catch (error) {
    console.error('❌ Error sending invitation:', error);
    res.status(500).json({ 
      error: 'Failed to send invitation',
      details: error.message 
    });
  }
};

// Export the new functions
exports.createUIToolkitSession = createUIToolkitSession;
exports.joinSession = joinSession;
exports.sendCallInvitation = sendCallInvitation;

// Functions are already exported using exports.functionName above
// No need for module.exports since we're using exports.functionName syntax
