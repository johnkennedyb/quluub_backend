const express = require('express');
const router = express.Router();
const { getCombinedDashboardData, pingDatabase, getUserSettings } = require('../controllers/dashboardController');
const { getDashboardStats } = require('../controllers/dashboardStatsController');
const { protect } = require('../middlewares/authMiddleware');

// @route   GET /api/dashboard/combined
// @desc    Get all dashboard data in a single call
// @access  Private
router.get('/combined', protect, getCombinedDashboardData);

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics with accurate percentages
// @access  Private
router.get('/stats', protect, getDashboardStats);

// @route   POST /api/dashboard/ping
// @desc    Ping database and update user activity
// @access  Private
router.post('/ping', protect, pingDatabase);

// @route   GET /api/dashboard/user-settings
// @desc    Get fresh user settings data
// @access  Private
router.get('/user-settings', protect, getUserSettings);

module.exports = router;
