
const express = require('express');
const authMongo = require('../controllers/authController');
const authSql = require('../controllers/authSqlController');
const { protect } = require('../middlewares/authMiddleware');
const { getPool } = require('../config/sql');

const router = express.Router();

const choose = (sqlFn, mongoFn) => (req, res, next) => {
  const requireSql = process.env.SQL_REQUIRED === 'true';
  const useSqlFlag = requireSql || process.env.SQL_ENABLED === 'true';
  if (!useSqlFlag) return mongoFn(req, res, next);
  try {
    getPool();
    return sqlFn(req, res, next);
  } catch (e) {
    if (requireSql) return res.status(503).json({ message: 'SQL is required but unavailable' });
    return mongoFn(req, res, next);
  }
};

router.post('/signup', choose(authSql.signup, authMongo.signup));
router.post('/admin/signup', choose(authSql.adminSignup, authMongo.adminSignup));
router.post('/login', choose(authSql.login, authMongo.login));
router.post('/google', choose(authSql.googleAuth, authMongo.googleAuth)); // New Google OAuth route
router.get('/profile', protect, choose(authSql.getUserProfile, authMongo.getUserProfile));
router.put('/change-password', protect, choose(authSql.changePassword, authMongo.changePassword));
router.post('/resend-validation', choose(authSql.resendValidationEmail, authMongo.resendValidationEmail));

module.exports = router;
