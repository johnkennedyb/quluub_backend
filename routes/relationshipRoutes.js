
const express = require('express');
const relMongo = require('../controllers/relationshipController');
const relSql = require('../controllers/relationshipSqlController');
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

router.post('/request', protect, choose(relSql.sendRequest, relMongo.sendRequest));
router.put('/:id/status', protect, choose(relSql.respondToRequest, relMongo.respondToRequest));
router.delete('/withdraw/:id', protect, choose(relSql.withdrawRequest, relMongo.withdrawRequest));
router.get('/matches', protect, choose(relSql.getMatches, relMongo.getMatches));
router.get('/pending', protect, choose(relSql.getPendingRequests, relMongo.getPendingRequests));
router.get('/sent', protect, choose(relSql.getSentRequests, relMongo.getSentRequests));

module.exports = router;
