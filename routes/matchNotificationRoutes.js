const express = require('express');
const router = express.Router();
const mongo = require('../controllers/matchNotificationController');
const sql = require('../controllers/matchNotificationSqlController');
const { protect } = require('../middlewares/authMiddleware');
const { adminAuth } = require('../middlewares/adminAuth');
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

// @route   POST /api/admin/match-notifications/send
// @desc    Send match notifications to all premium users
// @access  Private/Admin
router.post('/send', protect, adminAuth, choose(sql.sendMatchNotifications, mongo.sendMatchNotifications));

// @route   GET /api/admin/match-notifications
// @desc    Get match notification history
// @access  Private/Admin
router.get('/', protect, adminAuth, choose(sql.getMatchNotificationHistory, mongo.getMatchNotificationHistory));

module.exports = router;
