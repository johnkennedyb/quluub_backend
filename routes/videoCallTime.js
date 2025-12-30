const express = require('express');
const router = express.Router();
const mongo = require('../controllers/videoCallTimeController');
const sql = require('../controllers/videoCallTimeSqlController');
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

// Get video call time information for a pair
router.get('/info/:userId1/:userId2', protect, choose(sql.getVideoCallTimeInfo, mongo.getVideoCallTimeInfo));

// Check if users can make a video call
router.get('/can-call/:userId1/:userId2', protect, choose(sql.canMakeVideoCall, mongo.canMakeVideoCall));

// Start a video call session
router.post('/start-session', protect, choose(sql.startVideoCallSession, mongo.startVideoCallSession));

// End a video call session
router.post('/end-session', protect, choose(sql.endVideoCallSession, mongo.endVideoCallSession));

// Add call time directly (for existing/completed calls)
router.post('/add-time', protect, choose(sql.addCallTime, mongo.addCallTime));

// Get all video call pairs for a user
router.get('/user-pairs/:userId', protect, choose(sql.getUserVideoCallPairs, mongo.getUserVideoCallPairs));

// Reset video call time for a pair (admin only)
router.post('/reset', protect, choose(sql.resetVideoCallTime, mongo.resetVideoCallTime));

module.exports = router;
