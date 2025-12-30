const express = require('express');
const mongo = require('../controllers/feedController');
const sql = require('../controllers/feedSqlController');
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

router.get('/', protect, choose(sql.getFeed, mongo.getFeed));
router.put('/:id/read', protect, choose(sql.markFeedItemRead, mongo.markFeedItemRead));

module.exports = router;
