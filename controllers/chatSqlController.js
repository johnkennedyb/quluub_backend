const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { plans } = require('../config/plans');
const userRepo = require('../repositories/userRepository');
const chatRepo = require('../repositories/chatRepository');
const relRepo = require('../repositories/relationshipRepository');
const videoRepo = require('../repositories/videoInvitationRepository');
const { sendWaliViewChatEmailWithChatLink, sendContactWaliEmail, sendVideoCallNotificationEmail } = require('../utils/emailService');

async function areUsersMatched(userId1, userId2) {
  const a = await relRepo.getByPair(userId1, userId2);
  if (a && (a.status || '').toLowerCase() === 'matched') return true;
  const b = await relRepo.getByPair(userId2, userId1);
  if (b && (b.status || '').toLowerCase() === 'matched') return true;
  return false;
}

async function findUser(userId) {
  return userRepo.findById(userId);
}

async function sendInitialWaliEmail(femaleUser, otherUser) {
  try {
    if (!femaleUser || femaleUser.gender !== 'female' || !femaleUser.waliDetails) return;

    let waliDetails;
    try { waliDetails = typeof femaleUser.waliDetails === 'string' ? JSON.parse(femaleUser.waliDetails) : femaleUser.waliDetails; }
    catch (e) { return; }
    const waliEmail = waliDetails?.email;
    if (!waliEmail) return;

    const wardId = femaleUser._id.toString();
    const participantId = otherUser._id.toString();
    const conversationToken = jwt.sign({ wardId, participantId, waliEmail, type: 'wali_chat_view' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const chatLink = `https://match.quluub.com/wali-chat/${conversationToken}`;

    const wardName = `${femaleUser.fname} ${femaleUser.lname}`;
    const brotherName = `${otherUser.fname} ${otherUser.lname}`;
    const waliName = waliDetails.name || 'Respected Wali';

    await sendWaliViewChatEmailWithChatLink(waliEmail, waliName, wardName, brotherName, chatLink);
  } catch (_) {}
}

async function sendVideoCallReportToWali(callerId, recipientId, callData, recordingUrl = null) {
  try {
    const [caller, recipient] = await Promise.all([
      userRepo.findById(callerId),
      userRepo.findById(recipientId)
    ]);

    if (!caller || !recipient) return;

    const videoCallReportLink = `${process.env.FRONTEND_URL}/wali/video-call-report?caller=${callerId}&recipient=${recipientId}&callId=${callData.callId}`;

    const callDetails = {
      callerName: callData.callerName,
      recipientName: callData.recipientName,
      timestamp: callData.timestamp,
      callId: callData.callId,
      recordingUrl: recordingUrl
    };

    if (caller.gender === 'female' && caller.waliDetails) {
      try {
        const waliDetails = typeof caller.waliDetails === 'string' ? JSON.parse(caller.waliDetails) : caller.waliDetails;
        if (waliDetails?.email) {
          await sendVideoCallNotificationEmail(
            waliDetails.email,
            waliDetails.name || 'Wali',
            caller.fname,
            recipient.fname,
            callDetails,
            videoCallReportLink
          );
        }
      } catch (e) {}
    }

    if (recipient.gender === 'female' && recipient.waliDetails) {
      try {
        const waliDetails = typeof recipient.waliDetails === 'string' ? JSON.parse(recipient.waliDetails) : recipient.waliDetails;
        if (waliDetails?.email) {
          await sendVideoCallNotificationEmail(
            waliDetails.email,
            waliDetails.name || 'Wali',
            recipient.fname,
            caller.fname,
            callDetails,
            videoCallReportLink
          );
        }
      } catch (e) {}
    }

  } catch (error) {
    console.error('Error sending video call report to Wali (SQL):', error);
  }
}

// GET CHAT BETWEEN TWO USERS (legacy)
async function getChat(req, res) {
  const userInfo = req.user;
  const { userId } = req.query;

  try {
    const isMatched = await areUsersMatched(userInfo._id.toString(), userId);
    if (!isMatched) return res.status(403).json({ message: 'You can only chat with matched connections' });

    const contactUser = await findUser(userId);
    const currentUser = await findUser(userInfo._id);

    const chats = await chatRepo.getBetweenUsers(userInfo._id.toString(), userId.toString(), { sort: 'ASC', limit: 10000, offset: 0 });

    const returnData = chats.map((item) => ({
      sender: item.senderId === userInfo._id.toString() ? currentUser.username : contactUser.username,
      receiver: item.receiverId === userInfo._id.toString() ? currentUser.username : contactUser.username,
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
}

// GET ALL RECEIVED CHATS (legacy)
async function getAllChatReceived(req, res) {
  const userInfo = req.user;
  try {
    const rows = await chatRepo.getAllForUser(userInfo._id.toString(), { direction: 'received', sort: 'ASC' });

    // Build map of user IDs to user data
    const userIds = Array.from(new Set(rows.flatMap(r => [r.senderId, r.receiverId])));
    const users = await Promise.all(userIds.map(id => userRepo.findById(id)));
    const map = new Map();
    users.forEach(u => { if (u) map.set(u._id.toString(), u); });

    const chats = rows.map(r => ({
      sender: map.get(r.senderId)?.username || r.senderId,
      receiver: map.get(r.receiverId)?.username || r.receiverId,
      message: r.message,
      timestamp: r.created,
      id: r._id,
      status: r.status || null,
    }));

    return res.json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET CONVERSATIONS
async function getConversations(req, res) {
  try {
    const userId = req.user._id.toString();
    const all = await chatRepo.getAllForParticipant(userId);

    const convMap = new Map();
    for (const msg of all) {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { _id: otherId, lastMessage: msg });
      }
    }

    // Filter to matched users only (mirror Mongo controller behavior)
    const matches = await relRepo.listMatches(userId);
    const matchedUserIds = new Set(
      matches.map(m => (m.follower_user_id === userId ? m.followed_user_id : m.follower_user_id))
    );

    const conversations = [];
    for (const [otherId, data] of convMap.entries()) {
      if (!matchedUserIds.has(otherId)) continue;
      const userDetails = await userRepo.findById(otherId);
      const unreadCount = (data.lastMessage.receiverId === userId && (data.lastMessage.status === 'UNREAD')) ? 1 : 0;
      conversations.push({
        _id: otherId,
        lastMessage: data.lastMessage,
        userDetails: userDetails ? {
          username: userDetails.username,
          fname: userDetails.fname,
          lname: userDetails.lname,
          gender: userDetails.gender,
          country: userDetails.country,
          profile_pic: userDetails.profile_pic,
        } : null,
        unreadCount,
      });
    }

    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET MESSAGES (paginated)
async function getMessages(req, res) {
  try {
    const currentUserId = req.user._id.toString();
    const otherUserId = req.params.userId.toString();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const rows = await chatRepo.getBetweenUsers(currentUserId, otherUserId, { sort: 'DESC', limit, offset });

    // Mark unread messages from otherUser as READ (fire-and-forget)
    const toMarkIds = rows
      .filter(r => r.senderId === otherUserId && r.receiverId === currentUserId && (r.status === 'UNREAD' || !r.status))
      .map(r => r._id);
    if (toMarkIds.length) chatRepo.markReadByIds(toMarkIds).catch(err => console.error('Error updating read status:', err));

    // Return chronological order (oldest first)
    const chronological = [...rows].reverse();

    res.json({
      success: true,
      messages: chronological,
      pagination: {
        page,
        limit,
        hasMore: rows.length === limit,
        total: chronological.length,
      }
    });
  } catch (error) {
    console.error('❌ Error fetching messages (SQL):', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

// Internal helper for plan validation
async function getChatCountForValidationSQL(userId, userInfo) {
  return chatRepo.countSentFromTo(userInfo._id.toString(), userId.toString());
}

// ADD CHAT / SEND MESSAGE
async function addChat(req, res) {
  const userInfo = req.user;
  const { userId, message, messageType, videoCallData } = req.body;

  if (!userId || typeof userId !== 'string') return res.status(400).json({ message: 'Invalid or missing userId' });
  if (!message || typeof message !== 'string') return res.status(400).json({ message: 'Invalid or missing message' });

  try {
    // Check match
    const isMatched = await areUsersMatched(userInfo._id.toString(), userId);
    if (!isMatched) return res.status(403).json({ message: 'You can only message matched connections', error: 'USERS_NOT_MATCHED' });

    const contact = await findUser(userId);
    const currentUser = await findUser(userInfo._id);
    if (!contact) return res.status(404).json({ message: 'Contact user not found', error: 'CONTACT_NOT_FOUND' });
    if (!currentUser) return res.status(404).json({ message: 'Current user not found', error: 'CURRENT_USER_NOT_FOUND' });

    const { messageAllowance, wordCountPerMessage } = plans?.[currentUser.plan] || plans.freemium;

    let sentCount = 0;
    try { sentCount = await getChatCountForValidationSQL(contact._id, userInfo); } catch (_) {}

    const isVideoCallInvitation = messageType === 'video_call_invitation';
    if ((!isVideoCallInvitation && sentCount >= messageAllowance) || (!isVideoCallInvitation && message.split(' ').length >= wordCountPerMessage)) {
      return res.status(422).json({
        msg: 'plan exceeded',
        details: { sentCount, messageAllowance, messageWordCount: message.split(' ').length, wordCountPerMessage, plan: currentUser.plan }
      });
    }

    if (currentUser.gender === 'female') {
      if (!currentUser.waliDetails) {
        return res.status(422).json({ msg: 'wali details required to chat', error: 'MISSING_WALI_DETAILS' });
      }
      let waliEmail = null;
      try { waliEmail = JSON.parse(currentUser.waliDetails)?.email; } catch (e) {
        return res.status(422).json({ msg: 'Malformed waliDetails JSON', error: 'INVALID_WALI_DETAILS_FORMAT' });
      }
      if (!waliEmail) return res.status(422).json({ msg: 'wali email required to chat', error: 'MISSING_WALI_EMAIL' });
    }

    const chat = await chatRepo.addMessage(userInfo._id.toString(), contact._id.toString(), message, 'UNREAD');

    // Realtime broadcast (same behavior)
    const io = req.app.get('io');
    if (io) {
      const conversationId = [userInfo._id.toString(), contact._id.toString()].sort().join('_');
      const messageData = {
        _id: chat._id,
        senderId: userInfo._id,
        recipientId: contact._id,
        message,
        messageType: messageType || 'text',
        createdAt: chat.createdAt,
        conversationId,
        videoCallData: videoCallData || null,
      };
      const recipientSockets = [];
      io.sockets.sockets.forEach((socket) => { if (socket.userId === contact._id.toString()) recipientSockets.push(socket.id); });
      if (recipientSockets.length > 0) recipientSockets.forEach(socketId => io.to(socketId).emit('new_message', messageData));
      else io.to(contact._id.toString()).emit('new_message', messageData);
    }

    // First message wali email
    const totalMessages = await chatRepo.countBetween(userInfo._id.toString(), contact._id.toString());
    if (totalMessages === 1 && currentUser.gender === 'female' && currentUser.waliDetails) {
      await sendInitialWaliEmail(currentUser, contact);
    }

    return res.status(201).json(chat);
  } catch (error) {
    console.error('❌ Unexpected error in addChat (SQL):', error);
    if (error.name === 'ValidationError' || error.code === 11000) {
      return res.status(422).json({ message: 'Validation error', error: error.message, details: error });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// UPDATE CHAT STATUS
async function updateChat(req, res) {
  const { ids } = req.body;
  try {
    if (!Array.isArray(ids) || ids.length < 1) return res.json('Empty list');
    await chatRepo.markReadByIds(ids);
    return res.json('Updated successfully');
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET UNREAD COUNT
async function getUnreadCount(req, res) {
  try {
    const userId = req.user._id.toString();
    const unreadCount = await chatRepo.countUnreadForReceiver(userId);
    res.json({ unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// CREATE OR FIND CONVERSATION
async function createOrFindConversation(req, res) {
  try {
    const userId = req.user._id.toString();
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ message: 'Participant ID is required' });

    const isMatched = await areUsersMatched(userId, participantId);
    if (!isMatched) return res.status(403).json({ message: 'You can only chat with matched users' });

    return res.json({ conversationId: participantId, message: 'Ready to start or continue conversation' });
  } catch (error) {
    console.error('Error in createOrFindConversation (SQL):', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// CONTACT WALI (basic SQL-compatible implementation)
async function contactWali(req, res) {
  try {
    const { waliEmail: directWaliEmail, subject, content, userId } = req.body;
    const currentUser = await userRepo.findById(req.user._id.toString());

    let waliEmail = directWaliEmail;
    if (!waliEmail && userId) {
      const contactedUser = await userRepo.findById(userId.toString());
      if (!contactedUser) return res.status(404).json({ message: 'User not found' });
      if (contactedUser.gender !== 'female' || !contactedUser.waliDetails) {
        return res.status(400).json({ message: 'This user does not have wali details available for contact.' });
      }
      try {
        const parsed = typeof contactedUser.waliDetails === 'string' ? JSON.parse(contactedUser.waliDetails) : contactedUser.waliDetails;
        waliEmail = parsed?.email || null;
      } catch (e) {
        return res.status(500).json({ message: 'Error processing wali details.' });
      }
    }

    if (!waliEmail) return res.status(400).json({ message: 'waliEmail is required' });
    await sendContactWaliEmail(waliEmail, currentUser?.fname || 'Ward', subject || 'Message from Quluub', content || '');
    res.json({ success: true });
  } catch (error) {
    console.error('Error in contactWali (SQL):', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

async function sendVideoCallInvitation(req, res) {
  const userInfo = req.user;
  const { conversationId } = req.params;
  const invitationData = req.body;

  try {
    const sender = await userRepo.findById(userInfo._id.toString());
    const receiver = await userRepo.findById(conversationId.toString());
    if (!sender || !receiver) return res.status(404).json({ message: 'User not found' });

    const invitationMessage = `🎥 **Video Call Invitation**\n\n` +
      `📞 ${sender.fname || ''} ${sender.lname || ''} is inviting you to a video call\n\n` +
      `🏠 **Room:** ${invitationData.roomName || ''}\n` +
      `🔗 **Join Link:** ${invitationData.roomUrl || ''}\n\n` +
      `💡 **How to join:**\n` +
      `1. Click the link above\n` +
      `2. Allow camera and microphone access\n` +
      `3. Start your conversation!\n\n` +
      `⏰ **Call initiated:** ${new Date().toISOString()}`;

    const chat = await chatRepo.addMessage(userInfo._id.toString(), conversationId.toString(), invitationMessage, 'UNREAD');

    const invite = await videoRepo.createInvitation({
      senderId: userInfo._id.toString(),
      receiverId: conversationId.toString(),
      message: invitationMessage,
      meetingId: invitationData.meetingId,
      roomUrl: invitationData.roomUrl,
      hostRoomUrl: invitationData.hostRoomUrl,
      roomName: invitationData.roomName,
      startDate: invitationData.startDate,
      endDate: invitationData.endDate,
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('video_call_invitation', {
        type: 'video_call_invitation',
        senderId: userInfo._id,
        senderName: `${sender.fname || ''} ${sender.lname || ''}`.trim(),
        receiverId: conversationId,
        roomUrl: invitationData.roomUrl,
        roomName: invitationData.roomName,
        message: `${sender.fname || ''} is inviting you to a video call`,
        timestamp: new Date().toISOString(),
        chat: chat
      });

      io.emit('new_message', {
        conversationId: conversationId,
        senderId: userInfo._id,
        message: chat,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(201).json({
      message: 'Video call invitation sent successfully',
      chat: chat,
      invitation: invite,
      notification: {
        type: 'video_call_invitation',
        senderName: `${sender.fname || ''} ${sender.lname || ''}`.trim(),
        roomUrl: invitationData.roomUrl
      }
    });
  } catch (error) {
    console.error('❌ Error sending video call invitation (SQL):', error);
    res.status(500).json({ message: 'Failed to send video call invitation', error: error.message });
  }
}

async function initiateVideoCall(req, res) {
  const userInfo = req.user;
  const { recipientId } = req.body;
  try {
    const currentUser = await userRepo.findById(userInfo._id.toString());
    const recipientUser = await userRepo.findById(recipientId.toString());
    const plan = plans[currentUser.plan] || plans.freemium;
    if (!plan.videoCall) {
      return res.status(403).json({ success: false, message: 'Upgrade to premium to use video calls.' });
    }
    const isMatched = await areUsersMatched(userInfo._id.toString(), recipientId.toString());
    if (!isMatched) {
      return res.status(403).json({ success: false, message: 'You can only call matched connections.' });
    }
    if (!recipientUser) {
      return res.status(404).json({ success: false, message: 'Recipient not found.' });
    }
    const callId = uuidv4();
    const callData = {
      callId,
      callerId: userInfo._id.toString(),
      recipientId: recipientId.toString(),
      callerName: `${currentUser.fname || ''} ${currentUser.lname || ''}`.trim(),
      callerAvatar: currentUser.profilePicture || null,
      recipientName: `${recipientUser.fname || ''} ${recipientUser.lname || ''}`.trim(),
      recipientAvatar: recipientUser.profilePicture || null,
      timestamp: new Date().toISOString()
    };
    await sendVideoCallReportToWali(userInfo._id.toString(), recipientId.toString(), callData);
    res.status(200).json({ success: true, message: 'Video call initiated successfully.', callData });
  } catch (error) {
    console.error('Error initiating video call (SQL):', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

async function updateVideoCallInvitationStatus(req, res) {
  try {
    const { invitationId } = req.params;
    const { status } = req.body;
    const userId = req.user._id.toString();

    const invitation = await videoRepo.findById(invitationId);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Video call invitation not found or access denied' });
    }
    if (invitation.receiverId !== userId && invitation.senderId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const updated = await videoRepo.updateStatus(invitationId, status);
    return res.json({ success: true, message: `Invitation status updated to ${status}`, invitation: { _id: updated.id, status: updated.status, updatedAt: updated.updatedAt } });
  } catch (error) {
    console.error('❌ Error updating invitation status (SQL):', error);
    res.status(500).json({ success: false, message: 'Failed to update invitation status', error: error.message });
  }
}

async function getPendingVideoCallInvitations(req, res) {
  try {
    const userId = req.user._id.toString();
    const pendingInvitations = await videoRepo.listPendingForReceiver(userId);
    const formatted = await Promise.all(pendingInvitations.map(async (inv) => {
      const sender = await userRepo.findById(inv.senderId);
      return {
        _id: inv.id,
        conversationId: inv.senderId,
        callerId: inv.senderId,
        callerName: sender ? `${sender.fname || ''} ${sender.lname || ''}`.trim() : inv.senderId,
        recipientId: inv.receiverId,
        sessionId: inv.meetingId || null,
        callId: inv.meetingId || null,
        message: inv.message,
        createdAt: inv.createdAt,
        videoCallData: {
          meetingId: inv.meetingId || null,
          roomUrl: inv.roomUrl || null,
          hostRoomUrl: inv.hostRoomUrl || null,
          roomName: inv.roomName || null,
          status: inv.status || 'pending'
        }
      };
    }));
    res.json({ success: true, pendingInvitations: formatted });
  } catch (error) {
    console.error('❌ Error fetching pending video call invitations (SQL):', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending video call invitations', error: error.message });
  }
}

const sendMessage = addChat;

module.exports = {
  getChat,
  getAllChatReceived,
  getConversations,
  getMessages,
  addChat,
  sendMessage,
  updateChat,
  getUnreadCount,
  createOrFindConversation,
  contactWali,
  sendVideoCallInvitation,
  initiateVideoCall,
  updateVideoCallInvitationStatus,
  getPendingVideoCallInvitations,
};
