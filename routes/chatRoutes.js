
const express = require('express');
const { 
  getConversations, 
  getMessages, 
  sendMessage, 
  getUnreadCount,
  getChat,
  addChat,
  updateChat,
  getAllChatReceived,
  contactWali,
  initiateVideoCall,
  sendVideoCallInvitation,
  getPendingVideoCallInvitations,
  updateVideoCallInvitationStatus,
  createOrFindConversation
} = require('../controllers/chatController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// New routes
router.get('/conversations', protect, getConversations);
router.get('/messages/:userId', protect, getMessages);
router.post('/send', protect, sendMessage);
router.post('/send-invitation/:conversationId', protect, sendVideoCallInvitation);
router.get('/pending-invitations', protect, getPendingVideoCallInvitations);
router.patch('/invitation-status/:invitationId', protect, updateVideoCallInvitationStatus);
router.get('/unread', protect, getUnreadCount);
router.post('/contact-wali', protect, contactWali);
router.post('/video-call', protect, initiateVideoCall);
router.post('/initiate-video-call', protect, initiateVideoCall);
router.post('/conversations/create-or-find', protect, createOrFindConversation);

// Legacy routes for compatibility
router.get('/chat', protect, getChat);
router.post('/chat', protect, addChat);
router.put('/chat', protect, updateChat);
router.get('/chat/received', protect, getAllChatReceived);

module.exports = router;
