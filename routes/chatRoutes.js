
const express = require('express');
const chatMongo = require('../controllers/chatController');
const chatSql = require('../controllers/chatSqlController');
const { protect } = require('../middlewares/authMiddleware');
const { getPool } = require('../config/sql');

const router = express.Router();

const choose = (sqlFn, mongoFn) => (req, res, next) => {
  const requireSql = process.env.SQL_REQUIRED === 'true';
  const useSqlFlag = requireSql || process.env.SQL_ENABLED === 'true';
  if (!useSqlFlag) return mongoFn(req, res, next);
  try { getPool(); return sqlFn(req, res, next); } catch (e) {
    if (requireSql) return res.status(503).json({ message: 'SQL is required but unavailable' });
    return mongoFn(req, res, next);
  }
};

// New routes
router.get('/conversations', protect, choose(chatSql.getConversations, chatMongo.getConversations));
router.get('/messages/:userId', protect, choose(chatSql.getMessages, chatMongo.getMessages));
router.post('/send', protect, choose(chatSql.sendMessage, chatMongo.sendMessage));
router.post('/send-invitation/:conversationId', protect, choose(chatSql.sendVideoCallInvitation, chatMongo.sendVideoCallInvitation));
router.get('/pending-invitations', protect, choose(chatSql.getPendingVideoCallInvitations, chatMongo.getPendingVideoCallInvitations));
router.patch('/invitation-status/:invitationId', protect, choose(chatSql.updateVideoCallInvitationStatus, chatMongo.updateVideoCallInvitationStatus));
router.get('/unread', protect, choose(chatSql.getUnreadCount, chatMongo.getUnreadCount));
router.post('/contact-wali', protect, choose(chatSql.contactWali, chatMongo.contactWali));
router.post('/video-call', protect, choose(chatSql.initiateVideoCall, chatMongo.initiateVideoCall));
router.post('/initiate-video-call', protect, choose(chatSql.initiateVideoCall, chatMongo.initiateVideoCall));
router.post('/conversations/create-or-find', protect, choose(chatSql.createOrFindConversation, chatMongo.createOrFindConversation));

// Legacy routes for compatibility
router.get('/chat', protect, choose(chatSql.getChat, chatMongo.getChat));
router.post('/chat', protect, choose(chatSql.addChat, chatMongo.addChat));
router.put('/chat', protect, choose(chatSql.updateChat, chatMongo.updateChat));
router.get('/chat/received', protect, choose(chatSql.getAllChatReceived, chatMongo.getAllChatReceived));

module.exports = router;
