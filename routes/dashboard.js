const express = require('express');
const router = express.Router();
const mongo = require('../controllers/dashboardController');
const sql = require('../controllers/dashboardSqlController');
const mongoStats = require('../controllers/dashboardStatsController');
const sqlStats = require('../controllers/dashboardStatsSqlController');
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

// @route   GET /api/dashboard/combined
// @desc    Get all dashboard data in a single call
// @access  Private
router.get('/combined', protect, choose(sql.getCombinedDashboardData, mongo.getCombinedDashboardData));

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics with accurate percentages
// @access  Private
router.get('/stats', protect, choose(sqlStats.getDashboardStats, mongoStats.getDashboardStats));

// @route   POST /api/dashboard/ping
// @desc    Ping database and update user activity
// @access  Private
router.post('/ping', protect, choose(sql.pingDatabase, mongo.pingDatabase));

// @route   GET /api/dashboard/user-settings
// @desc    Get fresh user settings data
// @access  Private
router.get('/user-settings', protect, choose(sql.getUserSettings, mongo.getUserSettings));

module.exports = router;
