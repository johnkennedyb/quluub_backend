const express = require('express');
const mongo = require('../controllers/referralController');
const sql = require('../controllers/referralSqlController');
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

router.post('/generate', protect, choose(sql.generateReferralCode, mongo.generateReferralCode));
router.post('/apply', protect, choose(sql.applyReferralCode, mongo.applyReferralCode));
router.get('/stats', protect, choose(sql.getReferralStats, mongo.getReferralStats));

module.exports = router;
