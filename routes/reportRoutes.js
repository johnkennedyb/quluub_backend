const express = require('express');
const router = express.Router();
const { createReport, getReports, updateReportStatus } = require('../controllers/reportController');
const { protect } = require('../middlewares/authMiddleware');

// @route   POST /api/reports
// @desc    Create a new report
// @access  Private
router.post('/', protect, createReport);

// @route   GET /api/reports
// @desc    Get all reports (admin only)
// @access  Private/Admin
router.get('/', protect, getReports);

// @route   PUT /api/reports/:id/status
// @desc    Update report status
// @access  Private/Admin
router.put('/:id/status', protect, updateReportStatus);

module.exports = router;
