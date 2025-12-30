const express = require('express');
const router = express.Router();
const mongo = require('../controllers/getstreamVideoCallController');
const sql = require('../controllers/getstreamVideoCallSqlController');
const { protect } = require('../middlewares/authMiddleware');
const { getPool } = require('../config/sql');

const choose = (sqlFn, mongoFn) => (req, res, next) => {
  const requireSql = process.env.SQL_REQUIRED === 'true';
  const useSqlFlag = requireSql || process.env.SQL_ENABLED === 'true';
  if (!useSqlFlag) return mongoFn(req, res, next);
  try { getPool(); return sqlFn(req, res, next); } catch (e) {
    if (requireSql) return res.status(503).json({ message: 'SQL is required but unavailable' });
    return mongoFn(req, res, next);
  }
};

// Modern session-based routes (fresh approach)
// @desc Generate GetStream session token for professional video
// @route POST /api/getstream-video-call/token
// @access Private
router.post('/token', protect, choose(sql.generateSessionToken, mongo.generateSessionToken));

// @desc Create GetStream professional video session
// @route POST /api/getstream-video-call/create-session
// @access Private
router.post('/create-session', protect, choose(sql.createProfessionalSession, mongo.createProfessionalSession));

// Legacy routes (for backward compatibility)
// @desc Initiate GetStream video call (legacy)
// @route POST /api/getstream-video-call/initiate
// @access Private
router.post('/initiate', protect, choose(sql.initiateGetStreamCall, mongo.initiateGetStreamCall));

// @desc Get active GetStream video call invitations
// @route GET /api/getstream-video-call/invitations
// @access Private
router.get('/invitations', protect, choose(sql.getActiveInvitations, mongo.getActiveInvitations));

// @desc Clear GetStream video call notifications
// @route DELETE /api/getstream-video-call/notifications/:sessionId
// @access Private
router.delete('/notifications/:sessionId', protect, choose(sql.clearNotifications, mongo.clearNotifications));

module.exports = router;
