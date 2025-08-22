const express = require('express');
const router = express.Router();
const { getCombinedDashboardData } = require('../controllers/dashboardController');
const { protect } = require('../middlewares/auth');

// @route   GET /api/dashboard/combined
// @desc    Get all dashboard data in a single call
// @access  Private
router.get('/combined', protect, getCombinedDashboardData);

module.exports = router;
