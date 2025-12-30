
const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { sendVideoCallNotificationEmail } = require('../utils/emailService');

// @desc    Initiate a video call
// @route   POST /api/video-call/initiate
// @access  Private
exports.initiateCall = asyncHandler(async (req, res) => {
  const { recipientId } = req.body;
  const callerId = req.user._id;

  console.log('Video call initiation request:', { recipientId, callerId });

  if (!recipientId) {
    res.status(400);
    throw new Error('Recipient ID is required');
  }

  // Check if recipient exists
  const recipient = await User.findById(recipientId);
  if (!recipient) {
    res.status(404);
    throw new Error('Recipient not found');
  }

  const caller = await User.findById(callerId).select('fname lname username plan');
  if (!caller) {
    res.status(404);
    throw new Error('Caller not found');
  }

  // Only premium users can initiate video calls
  // Free users can join calls initiated by premium users
  if (!caller.plan || (caller.plan !== 'premium' && caller.plan !== 'pro')) {
    res.status(403);
    throw new Error('Only premium users can initiate video calls. Free users can join calls initiated by premium users.');
  }

  // Check monthly video call time limit for this match pair (5 minutes per month)
  const timeCheck = await MonthlyCallUsage.getRemainingTime(callerId, recipientId);
  if (!timeCheck.hasTimeRemaining) {
    res.status(403);
    throw new Error(`Monthly video call limit reached. You have used all 5 minutes for this month with this match. Remaining: 0:00`);
  }

  // Check for existing active call between these users
  let existingCall = await Call.findOne({
    $or: [
      { caller: callerId, recipient: recipientId, status: { $in: ['ringing', 'ongoing'] } },
      { caller: recipientId, recipient: callerId, status: { $in: ['ringing', 'ongoing'] } }
    ]
  });

  let roomId, call;

  if (existingCall) {
    // Reuse existing call
    roomId = existingCall.roomId;
    call = existingCall;
    console.log('Reusing existing call:', call._id);
  } else {
    // Generate a unique room ID for Jitsi
    roomId = `quluub-${uuidv4()}`;

    try {
      call = await Call.create({
        caller: callerId,
        recipient: recipientId,
        roomId,
        status: 'ringing',
      });
      console.log('New call record created:', call._id);
    } catch (error) {
      console.error('Error creating call:', error);
      res.status(500);
      throw new Error(`Failed to create call: ${error.message}`);
    }
  }

  // Create Jitsi room URL
  const jitsiRoomUrl = `https://meet.jit.si/${roomId}`;
  const callUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/video-call?room=${roomId}`;
  
  // Send chat message with video call link
  const chatMessage = `📹 Video call invitation: Join me at ${jitsiRoomUrl}`;
  
  try {
    const chat = new Chat({
      senderId: callerId,
      receiverId: recipientId,
      message: chatMessage,
      status: "UNREAD"
    });
    await chat.save();
    console.log('Video call link sent in chat');
  } catch (chatError) {
    console.error('Error sending chat message:', chatError);
  }

  try {
    const notification = await Notification.create({
      user: recipientId,
      type: 'video_call',
      message: `Incoming video call from ${caller.fname} ${caller.lname}`,
      relatedId: roomId,
    });

    console.log('Notification created:', notification._id);

    // Get the global io instance
    const io = global.io;
    let recipientNotified = false;
    let notificationMethods = [];

    if (io) {
      console.log(`Attempting to notify recipient ${recipientId} about incoming call from ${caller.fname} ${caller.lname}`);
      console.log('Total connected sockets:', io.sockets.sockets.size);

      // Multiple notification strategies to ensure delivery
      try {
        const recipientRoomSize = io.adapter?.rooms?.get(recipientId.toString())?.size || 0;
        console.log(`Recipient room ${recipientId} has ${recipientRoomSize} connections`);
        
        if (recipientRoomSize > 0) {
          io.to(recipientId.toString()).emit('video-call-incoming', {
            from: `${caller.fname} ${caller.lname}`,
            fromId: callerId,
            roomId: roomId,
            callUrl: callUrl,
            jitsiRoomUrl: jitsiRoomUrl,
            callerImage: caller.profilePicture || '',
            platform: 'jitsi'
          });
          
          io.to(recipientId.toString()).emit('new_notification', {
            _id: notification._id,
            type: 'video_call',
            message: `Incoming video call from ${caller.fname} ${caller.lname}`,
            relatedId: roomId,
            createdAt: notification.createdAt,
          });
          
          recipientNotified = true;
          notificationMethods.push('room-broadcast');
          console.log(`Notification sent to recipient room: ${recipientId}`);
        }
      } catch (error) {
        console.error('Error sending room notification:', error);
      }

      // Method 2: Find recipient socket by userId property
      if (!recipientNotified) {
        try {
          const recipientSocket = Array.from(io.sockets.sockets.values())
            .find(socket => socket.userId === recipientId.toString());

          if (recipientSocket) {
            recipientSocket.emit('video-call-incoming', {
              from: `${caller.fname} ${caller.lname}`,
              fromId: callerId,
              roomId: roomId,
              callUrl: callUrl,
              jitsiRoomUrl: jitsiRoomUrl,
              callerImage: caller.profilePicture || '',
              platform: 'jitsi'
            });

            recipientSocket.emit('new_notification', {
              _id: notification._id,
              type: 'video_call',
              message: `Incoming video call from ${caller.fname} ${caller.lname}`,
              relatedId: roomId,
              createdAt: notification.createdAt,
            });
            
            recipientNotified = true;
            notificationMethods.push('direct-socket');
            console.log(`Direct notification sent to socket: ${recipientSocket.id}`);
          }
        } catch (error) {
          console.error('Error sending direct socket notification:', error);
        }
      }

      // Method 3: Broadcast to all sockets (as fallback)
      if (!recipientNotified) {
        try {
          io.emit('video-call-notification-broadcast', {
            targetUserId: recipientId.toString(),
            from: `${caller.fname} ${caller.lname}`,
            fromId: callerId,
            roomId: roomId,
            callUrl: callUrl,
            jitsiRoomUrl: jitsiRoomUrl,
            callerImage: caller.profilePicture || '',
            platform: 'jitsi'
          });
          notificationMethods.push('broadcast');
          console.log('Fallback broadcast notification sent');
        } catch (error) {
          console.error('Error sending broadcast notification:', error);
        }
      }
    }

    console.log(`Jitsi video call initiated from ${caller.fname} ${caller.lname} to ${recipient.fname} ${recipient.lname} - Room: ${roomId}`);
    console.log('Notification methods used:', notificationMethods);

    // Send email notification to parent/guardian
    let emailSent = false;
    if (recipient.parentGuardianEmail) {
      try {
        const callDetails = {
          callerName: `${caller.fname} ${caller.lname}`,
          recipientName: `${recipient.fname} ${recipient.lname}`,
          timestamp: new Date().toISOString(),
          callId: roomId,
          recordingUrl: null
        };
        const reportLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wali/video-call-report?caller=${callerId}&recipient=${recipientId}&callId=${roomId}`;
        await sendVideoCallNotificationEmail(
          recipient.parentGuardianEmail,
          recipient.parentGuardianName || 'Guardian',
          `${recipient.fname} ${recipient.lname}`,
          `${caller.fname} ${caller.lname}`,
          callDetails,
          reportLink
        );
        emailSent = true;
        console.log('Email notification sent to parent/guardian');
      } catch (error) {
        console.error('Error sending email notification:', error);
      }
    }

    res.status(201).json({ 
      roomId,
      callUrl,
      jitsiRoomUrl,
      message: 'Call initiated successfully',
      recipientNotified: recipientNotified || notificationMethods.length > 0,
      platform: 'jitsi',
      callId: call._id,
      debug: {
        notificationMethods,
        totalConnectedSockets: io ? io.sockets.sockets.size : 0,
        recipientRoomExists: io ? !!io.adapter?.rooms?.get(recipientId.toString()) : false,
        emailSent,
        jitsiRoomCreated: true,
        existingCall: !!existingCall
      }
    });

  } catch (error) {
    console.error('Error in initiateCall:', error);
    res.status(500);
    throw new Error(`Failed to initiate call: ${error.message}`);
  }
});

// @desc    Update call status
// @route   PUT /api/video-call/status
// @access  Private
exports.updateCallStatus = asyncHandler(async (req, res) => {
  const { roomId, status } = req.body;

  if (!roomId || !status) {
    res.status(400);
    throw new Error('Room ID and status are required');
  }

  const call = await Call.findOne({ roomId });

  if (!call) {
    res.status(404);
    throw new Error('Call not found');
  }

  call.status = status;
  if (status === 'ongoing') {
    call.startedAt = new Date();
  } else if (['completed', 'missed', 'declined'].includes(status)) {
    call.endedAt = new Date();
    if (call.startedAt) {
      call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
    }
  }

  await call.save();

  // Get the global io instance
  const io = global.io;

  if (io) {
    // Notify participants of status change
    io.to(call.caller.toString()).emit('callStatusUpdate', { roomId, status });
    io.to(call.recipient.toString()).emit('callStatusUpdate', { roomId, status });
  }

  res.status(200).json({ 
    message: 'Call status updated',
    call: {
      roomId: call.roomId,
      status: call.status,
      duration: call.duration
    }
  });
});

// @desc    Get call by room ID
// @route   GET /api/video-call/room/:roomId
// @access  Private
exports.getCallByRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user._id;

  const call = await Call.findOne({ roomId })
    .populate('caller', 'fname lname username')
    .populate('recipient', 'fname lname username');

  if (!call) {
    res.status(404);
    throw new Error('Call not found');
  }

  // Check if user is authorized to access this call
  const isAuthorized = call.caller._id.toString() === userId.toString() || 
                      call.recipient._id.toString() === userId.toString();

  if (!isAuthorized) {
    res.status(403);
    throw new Error('Not authorized to access this call');
  }

  res.json({
    roomId: call.roomId,
    status: call.status,
    caller: call.caller,
    recipient: call.recipient,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    duration: call.duration
  });
});
