
const express = require('express');
const { 
  getUserProfile, 
  updateUserProfile, 
  getAllUsers, 
  getBrowseUsers, 
  upgradePlan,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  getProfileViewsCount,
  logProfileView,
  deleteAccount,
  searchUsers,
  debugUsers
} = require('../controllers/userController');
const { getProfileWithRelationships } = require('../controllers/optimizedUserController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Profile routes
router.get('/profile', protect, getUserProfile);
router.get('/profile/:userId', protect, getUserProfile);
router.get('/profile-optimized/:userId', protect, getProfileWithRelationships);
router.put('/:id', protect, updateUserProfile);

// Browse routes
router.get('/users', protect, getAllUsers);
router.get('/browse', protect, getBrowseUsers);
router.get('/debug-users', protect, debugUsers);
router.get('/search', protect, getBrowseUsers); // Add search endpoint for taofeeq_UI compatibility
router.get('/profile-views-count', protect, getProfileViewsCount);
router.post('/log-profile-view', protect, logProfileView);

// Payment routes
router.post('/upgrade-plan', upgradePlan);

// Favorites routes
router.post('/favorites/:userId', protect, addToFavorites);
router.delete('/favorites/:userId', protect, removeFromFavorites);
router.get('/favorites', protect, getFavorites);

// Account management routes
router.delete('/account', protect, deleteAccount);

module.exports = router;
