const express = require('express');
const router = express.Router();
const mongo = require('../controllers/reportController');
const sql = require('../controllers/reportSqlController');
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

// @route   POST /api/reports
// @desc    Create a new report
// @access  Private
router.post('/', protect, choose(sql.createReport, mongo.createReport));

// @route   GET /api/reports
// @desc    Get all reports (admin only)
// @access  Private/Admin
router.get('/', protect, choose(sql.getReports, mongo.getReports));

// @route   PUT /api/reports/:id/status
// @desc    Update report status
// @access  Private/Admin
router.put('/:id/status', protect, choose(sql.updateReportStatus, mongo.updateReportStatus));

module.exports = router;
