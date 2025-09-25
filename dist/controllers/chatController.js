const { v4: uuidv4 } = require("uuid");
const jwt = require('jsonwebtoken');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Relationship = require('../models/Relationship');
const { plans } = require('../config/plans');
const { sendChatReportToParents } = require('./waliController');
const Conversation = require('../models/Conversation');
const { sendWaliViewChatEmail, sendWaliViewChatEmailWithAttachments, sendWaliViewChatEmailWithChatLink, sendContactWaliEmail } = require('../utils/emailService');

const findUser = async (userId) => {
  return await User.findById(userId);
};

// Helper: Send initial Wali notification email when a conversation starts
// Sends to the female participant's wali with a secure chat link
const sendInitialWaliEmail = async (femaleUser, otherUser) => {
  try {
    if (!femaleUser || femaleUser.gender !== 'female' || !femaleUser.waliDetails) return;

    let waliDetails;
    try {
      waliDetails = JSON.parse(femaleUser.waliDetails);
    } catch (e) {
      console.error('❌ Malformed waliDetails JSON while sending initial email:', e);
      return;
    }

    const waliEmail = waliDetails?.email;
    if (!waliEmail) return;

    // Build public chat view link for wali
    const wardId = femaleUser._id.toString();
    const participantId = otherUser._id.toString();
    // Create a secure token containing conversation details for public access
    const conversationToken = jwt.sign({ 
      wardId, 
      participantId, 
      waliEmail,
      type: 'wali_chat_view'
    }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const chatLink = `https://match.quluub.com/wali-chat/${conversationToken}`;

    const wardName = `${femaleUser.fname} ${femaleUser.lname}`;
    const brotherName = `${otherUser.fname} ${otherUser.lname}`;
    const waliName = waliDetails.name || 'Respected Wali';

    // Enhanced email with direct chat view link
    await sendWaliViewChatEmailWithChatLink(waliEmail, waliName, wardName, brotherName, chatLink);
    console.log('📧 Initial Wali email sent to', waliEmail, 'for conversation between', wardName, 'and', brotherName);
  } catch (err) {
    console.error('❌ Failed to send initial Wali email:', err);
  }
};

const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

// Helper function to check if two users are matched
const areUsersMatched = async (userId1, userId2) => {
  const relationship = await Relationship.findOne({
    $or: [
      { follower_user_id: userId1, followed_user_id: userId2, status: 'matched' },
      { follower_user_id: userId2, followed_user_id: userId1, status: 'matched' }
    ]
  });
  return !!relationship;
};

// Helper function to send video call report to Wali only
const sendVideoCallReportToWali = async (callerId, recipientId, callData, recordingUrl = null) => {
  try {
    const [caller, recipient] = await Promise.all([
      User.findById(callerId),
      User.findById(recipientId)
    ]);

    if (!caller || !recipient) return;

    // Create video call report link for Wali oversight
    const videoCallReportLink = `${process.env.FRONTEND_URL}/wali/video-call-report?caller=${callerId}&recipient=${recipientId}&callId=${callData.callId}`;
    
    const callDetails = {
      callerName: callData.callerName,
      recipientName: callData.recipientName,
      timestamp: callData.timestamp,
      callId: callData.callId,
      recordingUrl: recordingUrl
    };

    // Send to caller's wali if female and has wali details
    if (caller.gender === 'female' && caller.waliDetails) {
      try {
        const waliDetails = JSON.parse(caller.waliDetails);
        if (waliDetails.email) {
          await sendVideoCallNotificationEmail(
            waliDetails.email, 
            waliDetails.name || 'Wali', 
            caller.fname, 
            recipient.fname, 
            callDetails,
            videoCallReportLink
          );
        }
      } catch (e) {
        console.error('Error parsing wali details for caller:', e);
      }
    }

    // Send to recipient's wali if female and has wali details
    if (recipient.gender === 'female' && recipient.waliDetails) {
      try {
        const waliDetails = JSON.parse(recipient.waliDetails);
        if (waliDetails.email) {
          await sendVideoCallNotificationEmail(
            waliDetails.email, 
            waliDetails.name || 'Wali', 
            recipient.fname, 
            caller.fname, 
            callDetails,
            videoCallReportLink
          );
        }
      } catch (e) {
        console.error('Error parsing wali details for recipient:', e);
      }
    }

    console.log(`Video call report sent to Wali/guardians for call between ${caller.fname} and ${recipient.fname}`);
  } catch (error) {
    console.error('Error sending video call report to Wali:', error);
  }
};


// GET CHAT BETWEEN TWO USERS
const getChat = async (req, res) => {
  const userInfo = req.user;
  const { userId } = req.query;

  try {
    // Check if users are matched before allowing to see messages
    const isMatched = await areUsersMatched(userInfo._id.toString(), userId);
    if (!isMatched) {
      return res.status(403).json({ message: 'You can only chat with matched connections' });
    }

    const contactUser = await findUser(userId);
    const currentUser = await findUser(userInfo._id);

    const chats = await Chat.find({
      $or: [
        { senderId: userInfo._id, receiverId: userId },
        { senderId: userId, receiverId: userInfo._id },
      ],
    }).sort("created");

    const returnData = chats.map((item) => ({
      sender: item.senderId.equals(userInfo._id)
        ? currentUser.username
        : contactUser.username,
      receiver: item.receiverId.equals(userInfo._id)
        ? currentUser.username
        : contactUser.username,
      message: item.message,
      timestamp: item.created,
      id: item._id,
      status: item.status,
    }));

    return res.json(returnData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ALL RECEIVED CHATS - OPTIMIZED
const getAllChatReceived = async (req, res) => {
  const userInfo = req.user;
  
  try {
    // Use aggregation to join user data in a single query
    const chats = await Chat.aggregate([
      { $match: { receiverId: userInfo._id } },
      { $sort: { created: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'senderId',
          foreignField: '_id',
          as: 'senderInfo'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'receiverId',
          foreignField: '_id',
          as: 'receiverInfo'
        }
      },
      {
        $project: {
          sender: { $arrayElemAt: ['$senderInfo.username', 0] },
          receiver: { $arrayElemAt: ['$receiverInfo.username', 0] },
          message: 1,
          timestamp: '$created',
          id: '$_id',
          status: 1
        }
      }
    ]);

    return res.json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET CONVERSATIONS
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all chats where user is sender or receiver
    const chats = await Chat.aggregate([
      {
        $match: {
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ]
        }
      },
      {
        $sort: { created: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", userId] },
              "$receiverId",
              "$senderId"
            ]
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $unwind: "$userDetails"
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          "userDetails.username": 1,
          "userDetails.fname": 1,
          "userDetails.lname": 1,
          "userDetails.gender": 1,
          "userDetails.country": 1,
          "userDetails.profile_pic": 1,
          unreadCount: {
            $cond: [
              {
                $and: [
                  { $eq: ["$lastMessage.receiverId", userId] },
                  { $eq: ["$lastMessage.status", "UNREAD"] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    ]);
    
    // Get all matched user IDs in a single query
    const relationships = await Relationship.find({
      $or: [
        { follower_user_id: userId, status: 'matched' },
        { followed_user_id: userId, status: 'matched' }
      ]
    }).lean();
    
    const matchedUserIds = new Set();
    relationships.forEach(rel => {
      if (rel.follower_user_id.toString() === userId.toString()) {
        matchedUserIds.add(rel.followed_user_id.toString());
      } else {
        matchedUserIds.add(rel.follower_user_id.toString());
      }
    });
    
    // Filter conversations to only include matched users
    const matchedConversations = chats.filter(chat => 
      matchedUserIds.has(chat._id.toString())
    );
    
    res.json(matchedConversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET MESSAGES
const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Cap at 100
    const skip = (page - 1) * limit;

    console.log(`📨 Fetching messages for conversation between ${currentUserId} and ${otherUserId}, page: ${page}, limit: ${limit}`);

    // Single optimized query with pagination and lean for better performance
    const messages = await Chat.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    })
      .sort({ created: -1 }) // Get newest first
      .limit(limit)
      .skip(skip)
      .lean() // Use lean() for 3x better performance
      .exec();

    // Async update of read status (don't block response)
    setImmediate(() => {
      Chat.updateMany(
        {
          $or: [
            { senderId: otherUserId, receiverId: currentUserId },
            { senderId: currentUserId, receiverId: otherUserId }
          ],
          status: { $in: ['UNREAD'] }
        },
        { $set: { status: 'READ' } }
      ).exec().catch(err => console.error('Error updating read status:', err));
    });

    // Return messages in chronological order (oldest first)
    const chronologicalMessages = messages.reverse();

    res.json({
      success: true,
      messages: chronologicalMessages,
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit,
        total: chronologicalMessages.length
      }
    });

    console.log(`✅ Returned ${chronologicalMessages.length} messages for conversation between ${currentUserId} and ${otherUserId}`);

  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// COUNT SENT MESSAGES FOR VALIDATION
const getChatCountForValidation = async (userId, userInfo) => {
  // ... (rest of the code remains the same)
  const count = await Chat.countDocuments({
    senderId: userInfo._id,
    receiverId: userId,
  });
  return count;
};

// ADD CHAT / SEND MESSAGE - OPTIMIZED
const addChat = async (req, res) => {
  const startTime = Date.now();
  console.log('📥 Optimized addChat request started');
  
  const userInfo = req.user;
  const { userId, message, messageType, videoCallData } = req.body;

  // Defensive checks for required fields
  if (!userId || typeof userId !== 'string') {
    console.error('❌ Invalid or missing userId:', userId);
    return res.status(400).json({ message: 'Invalid or missing userId' });
  }
  if (!message || typeof message !== 'string') {
    console.error('❌ Invalid or missing message:', message);
    return res.status(400).json({ message: 'Invalid or missing message' });
  }
  console.log('🔍 Send Message Debug:', {
    senderId: userInfo._id,
    receiverId: userId,
    messageLength: message?.length,
    wordCount: message?.split(" ").length,
    senderGender: userInfo.gender || 'unknown',
    senderPlan: userInfo.plan || 'unknown',
    hasWaliDetails: !!userInfo.waliDetails
  });
  
  try {
    // Check if users are matched before allowing to send messages
    const isMatched = await areUsersMatched(userInfo._id.toString(), userId);
    if (!isMatched) {
      console.log('❌ Users not matched:', { senderId: userInfo._id, receiverId: userId });
      return res.status(403).json({ 
        message: 'You can only message matched connections',
        error: 'USERS_NOT_MATCHED'
      });
    }

    const contact = await findUser(userId);
    const currentUser = await findUser(userInfo._id);
    
    if (!contact) {
      console.error('❌ Contact user not found:', userId);
      return res.status(404).json({ 
        message: 'Contact user not found',
        error: 'CONTACT_NOT_FOUND'
      });
    }
    
    if (!currentUser) {
      console.error('❌ Current user not found:', userInfo._id);
      return res.status(404).json({ 
        message: 'Current user not found',
        error: 'CURRENT_USER_NOT_FOUND'
      });
    }

    const {
      messageAllowance,
      wordCountPerMessage,
    } = plans?.[currentUser.plan] || plans.freemium;
    
    console.log('📋 Plan Configuration:', {
      userPlan: currentUser.plan,
      messageAllowance,
      wordCountPerMessage,
      availablePlans: Object.keys(plans)
    });

    let sentCount;
    try {
      sentCount = await getChatCountForValidation(contact._id, userInfo);
      console.log('📊 Message count retrieved:', { sentCount, contactId: contact._id });
    } catch (error) {
      console.error('❌ Error getting message count:', error);
      sentCount = 0; // Default to 0 if count fails
    }
    
    // Check if this is a video call invitation (exempt from word limits)
    const isVideoCallInvitation = messageType === 'video_call_invitation';
    
    console.log('📊 Message Limits Check:', {
      currentPlan: currentUser.plan,
      sentCount,
      messageAllowance,
      messageWordCount: message.split(" ").length,
      wordCountPerMessage,
      exceedsCount: sentCount >= messageAllowance,
      exceedsWords: message.split(" ").length >= wordCountPerMessage,
      isVideoCallInvitation,
      messageType
    });

    if (
      (!isVideoCallInvitation && sentCount >= messageAllowance) ||
      (!isVideoCallInvitation && message.split(" ").length >= wordCountPerMessage)
    ) {
      console.log('❌ Plan exceeded - returning 422', {
        sentCount,
        messageAllowance,
        messageWordCount: message.split(" ").length,
        wordCountPerMessage,
        plan: currentUser.plan
      });
      return res.status(422).json({ 
        msg: `plan exceeded`,
        details: {
          sentCount,
          messageAllowance,
          messageWordCount: message.split(" ").length,
          wordCountPerMessage,
          plan: currentUser.plan
        }
      });
    }

    if (currentUser.gender === "female") {
      console.log('👩 Female user - checking wali details:', {
        hasWaliDetails: !!currentUser.waliDetails,
        waliDetailsContent: currentUser.waliDetails ? 'present' : 'missing'
      });
      
      if (!currentUser.waliDetails) {
        console.log('❌ Missing wali details - returning 422');
        return res.status(422).json({ 
          msg: `wali details required to chat`,
          error: 'MISSING_WALI_DETAILS'
        });
      }

      let waliEmail = null;
      try {
        waliEmail = JSON.parse(currentUser.waliDetails)?.email;
      } catch (e) {
        console.error('❌ Malformed waliDetails JSON:', currentUser.waliDetails, e);
        return res.status(422).json({ 
          msg: 'Malformed waliDetails JSON',
          error: 'INVALID_WALI_DETAILS_FORMAT'
        });
      }
      console.log('📧 Wali email check:', {
        hasWaliEmail: !!waliEmail,
        waliEmail: waliEmail ? 'present' : 'missing'
      });
      
      if (!waliEmail) {
        console.log('❌ Missing wali email - returning 422');
        return res.status(422).json({ 
          msg: `wali email required to chat`,
          error: 'MISSING_WALI_EMAIL'
        });
      }
    }

    const chat = new Chat({
      senderId: userInfo._id,
      receiverId: contact._id,
      message: message,
      status: "UNREAD"
    });
    await chat.save();

    // 🚀 REAL-TIME MESSAGE BROADCASTING
    // Get socket.io instance and broadcast message to recipient
    const io = req.app.get('io');
    if (io) {
      console.log('📡 Broadcasting message to recipient:', contact._id.toString());
      
      // Create consistent conversation ID (same format as frontend)
      const conversationId = [userInfo._id.toString(), contact._id.toString()].sort().join('_');
      
      // Create message object for real-time broadcast
      const messageData = {
        _id: chat._id,
        senderId: userInfo._id,
        recipientId: contact._id,
        message: message,
        messageType: messageType || 'text',
        createdAt: chat.createdAt,
        conversationId: conversationId,
        videoCallData: videoCallData || null // Include video call data if present
      };
      
      // Enhanced logging for video call invitations
      if (messageType === 'video_call_invitation') {
        console.log('📞 Broadcasting video call invitation:', {
          messageType,
          senderId: userInfo._id,
          recipientId: contact._id,
          videoCallData,
          conversationId
        });
      }
      
      // SINGLE MESSAGE BROADCAST - Only emit to recipient's room to prevent duplicates
      io.to(contact._id.toString()).emit('new_message', messageData);
      
      console.log('✅ Message broadcasted successfully');
    } else {
      console.warn('⚠️ Socket.io not available for broadcasting');
    }

    // Send chat report to parents after every 5th message in the conversation
    const totalMessages = await Chat.countDocuments({
      $or: [
        { senderId: userInfo._id, receiverId: contact._id },
        { senderId: contact._id, receiverId: userInfo._id }
      ]
    });

    // Send Wali notification email only once when conversation starts
    // and only if the first message is sent by the female (ward)
    if (totalMessages === 1 && currentUser.gender === 'female' && currentUser.waliDetails) {
      await sendInitialWaliEmail(currentUser, contact);
    }

    // Send chat report for first message or every 5 messages
    if (totalMessages === 1 || totalMessages % 5 === 0) {
      await sendChatReportToParents(userInfo._id, contact._id);
    }

    return res.status(201).json(chat);
  } catch (error) {
    console.error('❌ Unexpected error in addChat:', error);
    
    // Check if it's a validation error that should return 422
    if (error.name === 'ValidationError' || error.code === 11000) {
      return res.status(422).json({ 
        message: 'Validation error', 
        error: error.message,
        details: error
      });
    }
    
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// UPDATE CHAT STATUS
const updateChat = async (req, res) => {
  const { ids } = req.body;

  try {
    if (!Array.isArray(ids) || ids.length < 1) {
      return res.json("Empty list");
    }

    await Chat.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "READ" } }
    );

    return res.json("Updated successfully");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET UNREAD COUNT
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Count unread messages from matched users only
    const unreadCount = await Chat.countDocuments({
      receiverId: userId,
      status: 'UNREAD'
    });
    
    res.json({ unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// CREATE OR FIND CONVERSATION WITH SPECIFIC USER
const createOrFindConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { participantId } = req.body;
    
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }
    
    // Check if users are matched
    const isMatched = await areUsersMatched(userId.toString(), participantId);
    if (!isMatched) {
      return res.status(403).json({ message: 'You can only chat with matched users' });
    }
    
    // Look for existing conversation between these users
    const existingChat = await Chat.findOne({
      $or: [
        { senderId: userId, receiverId: participantId },
        { senderId: participantId, receiverId: userId }
      ]
    }).sort({ created: -1 });
    
    if (existingChat) {
      // Return existing conversation ID (using participant ID as conversation identifier)
      return res.json({ 
        conversationId: participantId,
        message: 'Existing conversation found'
      });
    } else {
      // No existing conversation, but users are matched so they can start chatting
      // Return the participant ID as conversation identifier
      return res.json({ 
        conversationId: participantId,
        message: 'Ready to start new conversation'
      });
    }
    
  } catch (error) {
    console.error('Error in createOrFindConversation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// SEND MESSAGE (for API compatibility)
const sendMessage = addChat;

// SEND VIDEO CALL INVITATION
const sendVideoCallInvitation = async (req, res) => {
  const userInfo = req.user;
  const { conversationId } = req.params;
  const invitationData = req.body;
  
  console.log('📞 Sending video call invitation:', {
    senderId: userInfo._id,
    conversationId,
    roomUrl: invitationData.roomUrl,
    roomName: invitationData.roomName
  });
  
  try {
    // Get sender and receiver information
    const sender = await User.findById(userInfo._id);
    const receiver = await User.findById(conversationId);
    
    if (!sender || !receiver) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Create a beautifully formatted video call invitation message
    const invitationMessage = `🎥 **Video Call Invitation**\n\n` +
      `📞 ${sender.fname} ${sender.lname} is inviting you to a video call\n\n` +
      `🏠 **Room:** ${invitationData.roomName}\n` +
      `🔗 **Join Link:** ${invitationData.roomUrl}\n\n` +
      `💡 **How to join:**\n` +
      `1. Click the link above\n` +
      `2. Allow camera and microphone access\n` +
      `3. Start your conversation!\n\n` +
      `⏰ **Call initiated:** ${new Date().toLocaleString()}`;
    
    const chat = new Chat({
      senderId: userInfo._id,
      receiverId: conversationId,
      message: invitationMessage,
      status: "UNREAD",
      messageType: "video_call_invitation",
      videoCallData: {
        meetingId: invitationData.meetingId,
        roomUrl: invitationData.roomUrl,
        hostRoomUrl: invitationData.hostRoomUrl,
        roomName: invitationData.roomName,
        startDate: invitationData.startDate,
        endDate: invitationData.endDate,
        senderName: `${sender.fname} ${sender.lname}`,
        receiverName: `${receiver.fname} ${receiver.lname}`
      }
    });
    
    await chat.save();
    
    // Send real-time notification via socket to the receiver
    const io = req.app.get('io');
    if (io) {
      // Emit to the specific receiver
      io.emit('video_call_invitation', {
        type: 'video_call_invitation',
        senderId: userInfo._id,
        senderName: `${sender.fname} ${sender.lname}`,
        receiverId: conversationId,
        roomUrl: invitationData.roomUrl,
        roomName: invitationData.roomName,
        message: `${sender.fname} is inviting you to a video call`,
        timestamp: new Date().toISOString(),
        chat: chat
      });
      
      // Also emit as a new message for real-time chat updates
      io.emit('new_message', {
        conversationId: conversationId,
        senderId: userInfo._id,
        message: chat,
        timestamp: new Date().toISOString()
      });
      
      console.log('📡 Real-time notifications sent via socket');
    }
    
    console.log('✅ Video call invitation sent successfully with notifications');
    
    return res.status(201).json({
      message: 'Video call invitation sent successfully',
      chat: chat,
      notification: {
        type: 'video_call_invitation',
        senderName: `${sender.fname} ${sender.lname}`,
        roomUrl: invitationData.roomUrl
      }
    });
    
  } catch (error) {
    console.error('❌ Error sending video call invitation:', error);
    res.status(500).json({ 
      message: 'Failed to send video call invitation', 
      error: error.message 
    });
  }
};

const contactWali = async (req, res) => {
  const { userId } = req.body; // The user whose wali is being contacted
  const currentUser = req.user; // The user initiating the contact

  try {
    const contactedUser = await User.findById(userId);

    if (!contactedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (contactedUser.gender !== 'female' || !contactedUser.waliDetails) {
      return res.status(400).json({ message: 'This user does not have wali details available for contact.' });
    }

    let waliDetails;
    try {
      waliDetails = JSON.parse(contactedUser.waliDetails);
    } catch (e) {
      console.error('Error parsing wali details for contacted user:', e);
      return res.status(500).json({ message: 'Error processing wali details.' });
    }

    if (!waliDetails.email) {
      return res.status(400).json({ message: 'Wali email is not available.' });
    }

    // Create a record of the contact attempt
    const waliChat = new WaliChat({
      userId: contactedUser._id,
      waliEmail: waliDetails.email,
      contactedBy: currentUser._id,
      message: `User ${currentUser.fname} (${currentUser._id}) initiated contact with the wali of ${contactedUser.fname} (${contactedUser._id}).`
    });
    await waliChat.save();

    // Send email notification to the wali
    await sendContactWaliEmail(waliDetails.email, currentUser.fname);

    res.status(200).json({ message: 'Wali has been contacted successfully.' });

  } catch (error) {
    console.error('Error in contactWali controller:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// INITIATE WEBRTC VIDEO CALL
const initiateVideoCall = async (req, res) => {
  const userInfo = req.user;
  const { recipientId } = req.body;

  try {
    const currentUser = await findUser(userInfo._id);
    const recipientUser = await findUser(recipientId);
    const plan = plans[currentUser.plan] || plans.freemium;

    // 1. Check if user's plan allows video calls
    if (!plan.videoCall) {
      return res.status(403).json({ 
        success: false,
        message: 'Upgrade to premium to use video calls.' 
      });
    }

    // 2. Check if users are matched
    const isMatched = await areUsersMatched(userInfo._id.toString(), recipientId);
    if (!isMatched) {
      return res.status(403).json({ 
        success: false,
        message: 'You can only call matched connections.' 
      });
    }

    // 3. Check if recipient exists
    if (!recipientUser) {
      return res.status(404).json({ 
        success: false,
        message: 'Recipient not found.' 
      });
    }

    // 4. Generate call session data
    const callId = uuidv4();
    const callData = {
      callId,
      callerId: userInfo._id.toString(),
      recipientId,
      callerName: `${currentUser.fname} ${currentUser.lname}`,
      callerAvatar: currentUser.profilePicture || null,
      recipientName: `${recipientUser.fname} ${recipientUser.lname}`,
      recipientAvatar: recipientUser.profilePicture || null,
      timestamp: new Date().toISOString()
    };

    console.log(`WebRTC video call initiated by ${currentUser.username} to ${recipientUser.username}`);

    // 5. Send video call report to Wali/guardians
    await sendVideoCallReportToWali(userInfo._id.toString(), recipientId, callData);

    res.status(200).json({ 
      success: true,
      message: 'Video call initiated successfully.',
      callData
    });

  } catch (error) {
    console.error('Error initiating video call:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

// UPDATE VIDEO CALL INVITATION STATUS
const updateVideoCallInvitationStatus = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    
    console.log(`📝 Updating invitation ${invitationId} status to: ${status}`);

    // Find the invitation and verify user has permission to update it
    const invitation = await Message.findOne({
      _id: invitationId,
      messageType: 'video_call_invitation',
      $or: [
        { 'videoCallData.recipientId': userId },
        { senderId: userId }
      ]
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Video call invitation not found or access denied'
      });
    }

    // Update the invitation status
    invitation.videoCallData = {
      ...invitation.videoCallData,
      status: status,
      updatedAt: new Date()
    };

    await invitation.save();
    
    console.log(`✅ Invitation ${invitationId} status updated to: ${status}`);

    res.json({
      success: true,
      message: `Invitation status updated to ${status}`,
      invitation: {
        _id: invitation._id,
        status: invitation.videoCallData.status,
        updatedAt: invitation.videoCallData.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating invitation status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update invitation status',
      error: error.message
    });
  }
};

// GET PENDING VIDEO CALL INVITATIONS
const getPendingVideoCallInvitations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📞 Fetching pending video call invitations for user:', userId);

    // Find all video call invitation messages where user is recipient
    // and the invitation is still pending (not expired, accepted, or declined)
    const pendingInvitations = await Message.find({
      messageType: 'video_call_invitation',
      'videoCallData.recipientId': userId,
      'videoCallData.status': { $in: ['pending', undefined, null] },
      // Only get invitations from last 24 hours to avoid old stale invitations
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .populate('senderId', 'fname lname username')
    .populate('conversationId')
    .sort({ createdAt: -1 });

    console.log(`✅ Found ${pendingInvitations.length} pending video call invitations`);

    // Format the invitations for frontend
    const formattedInvitations = pendingInvitations.map(invitation => ({
      _id: invitation._id,
      conversationId: invitation.conversationId._id,
      callerId: invitation.senderId._id,
      callerName: `${invitation.senderId.fname} ${invitation.senderId.lname}`,
      recipientId: userId,
      sessionId: invitation.videoCallData?.sessionId,
      callId: invitation.videoCallData?.callId,
      message: invitation.message,
      createdAt: invitation.createdAt,
      videoCallData: invitation.videoCallData
    }));

    res.json({
      success: true,
      pendingInvitations: formattedInvitations
    });

  } catch (error) {
    console.error('❌ Error fetching pending video call invitations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending video call invitations',
      error: error.message
    });
  }
};

module.exports = {
  getChat,
  getAllChatReceived,
  getConversations,
  getMessages,
  addChat,
  updateChat,
  getUnreadCount,
  sendMessage,
  createOrFindConversation,
  sendVideoCallInvitation,
  contactWali,
  initiateVideoCall,
  getPendingVideoCallInvitations,
  updateVideoCallInvitationStatus
};
