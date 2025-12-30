const express = require('express');
const mongo = require('../controllers/notificationController');
const sql = require('../controllers/notificationSqlController');
const { protect, admin } = require('../middlewares/authMiddleware');
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

router.use(protect);

router.get('/', choose(sql.getNotifications, mongo.getNotifications));
router.put('/:id/read', choose(sql.markAsRead, mongo.markAsRead));
router.delete('/:id', choose(sql.deleteNotification, mongo.deleteNotification));
router.post('/send-call-notification', choose(sql.sendCallNotification, mongo.sendCallNotification));

// @desc    Send a global notification
// @route   POST /api/notifications/global
// @access  Private/Admin
router.post('/global', admin, choose(sql.sendGlobalNotification, mongo.sendGlobalNotification));

module.exports = router;