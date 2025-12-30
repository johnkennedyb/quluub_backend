const userRepo = require('../repositories/userRepository');
const reportRepo = require('../repositories/reportRepository');

// @desc    Create a new report (SQL)
// @route   POST /api/reports
// @access  Private
async function createReport(req, res) {
  try {
    const { reportedUserId, reason, type, reportType, description } = req.body;
    const reporterId = (req.user._id || req.user.id).toString();

    const reportTypeValue = type || reportType || 'user_behavior';
    if (!reportedUserId || !reason) {
      return res.status(400).json({ message: 'Reported user ID and reason are required' });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const reportedUser = await userRepo.findById(reportedUserId);
    if (!reportedUser) return res.status(404).json({ message: 'Reported user not found' });

    const report = await reportRepo.create({
      reporter: reporterId,
      reported: reportedUserId,
      reason,
      description: description || reason,
      type: reportTypeValue,
    });

    return res.status(201).json({ message: 'Report submitted successfully', report });
  } catch (error) {
    console.error('Create report (SQL) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Get all reports (admin)
// @route   GET /api/reports
// @access  Private/Admin
async function getReports(req, res) {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const status = req.query.status || 'all';

    const { reports, total } = await reportRepo.list({ page, limit, status });

    res.json({
      reports,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Get reports (SQL) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Update report status
// @route   PUT /api/reports/:id/status
// @access  Private/Admin
async function updateReportStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const valid = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const updated = await reportRepo.updateStatus(id, { status, adminNotes, reviewedBy: (req.user._id || req.user.id).toString() });
    if (!updated) return res.status(404).json({ message: 'Report not found' });
    res.json({ message: 'Report status updated successfully', report: updated });
  } catch (error) {
    console.error('Update report status (SQL) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  createReport,
  getReports,
  updateReportStatus,
};
