const express = require('express');
const userMongo = require('../controllers/userController');
const userSql = require('../controllers/userSqlController');
const { getProfileWithRelationships } = require('../controllers/optimizedUserController');
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

// Profile routes
router.get('/profile', protect, choose(userSql.getUserProfile, userMongo.getUserProfile));
router.get('/profile/:userId', protect, choose(userSql.getUserProfile, userMongo.getUserProfile));
router.get('/profile-optimized/:userId', protect, choose(userSql.getProfileWithRelationships || getProfileWithRelationships, getProfileWithRelationships));
router.put('/:id', protect, choose(userSql.updateUserProfile, userMongo.updateUserProfile));

// Browse routes
router.get('/users', protect, choose(userSql.getAllUsers, userMongo.getAllUsers));
router.get('/browse', protect, choose(userSql.getBrowseUsers, userMongo.getBrowseUsers));
router.get('/debug-users', protect, choose(userSql.debugUsers, userMongo.debugUsers));
router.get('/search', protect, choose(userSql.getBrowseUsers, userMongo.getBrowseUsers)); // search uses same handler
router.get('/profile-views-count', protect, choose(userSql.getProfileViewsCount, userMongo.getProfileViewsCount));
router.post('/log-profile-view', protect, choose(userSql.logProfileView, userMongo.logProfileView));

// Payment routes
router.post('/upgrade-plan', choose(userSql.upgradePlan, userMongo.upgradePlan));

// Favorites routes
router.post('/favorites/:userId', protect, choose(userSql.addToFavorites, userMongo.addToFavorites));
router.delete('/favorites/:userId', protect, choose(userSql.removeFromFavorites, userMongo.removeFromFavorites));
router.get('/favorites', protect, choose(userSql.getFavorites, userMongo.getFavorites));

// Account management routes
router.delete('/account', protect, choose(userSql.deleteAccount, userMongo.deleteAccount));

module.exports = router;
