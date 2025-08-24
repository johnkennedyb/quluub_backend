const express = require('express');
const router = express.Router();
const { getCombinedDashboardData } = require('../controllers/dashboardController');
const { getDashboardStats } = require('../controllers/dashboardStatsController');
const { protect } = require('../middlewares/auth');

// @route   GET /api/dashboard/combined
// @desc    Get all dashboard data in a single call
// @access  Private
router.get('/combined', protect, getCombinedDashboardData);

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics with accurate percentages
// @access  Private
router.get('/stats', protect, getDashboardStats);

module.exports = router;
