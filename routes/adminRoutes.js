const express = require('express');
const router = express.Router();
const {
  getStats,
  getAllUsers,
  getUserDetails,
  updateUserAccountStatus,
  updateUserPlan,
  updateUser,
  deleteUser,
  sendPasswordResetLink,
  verifyUserEmail,
  getAllCalls,
  saveCallRecord,
  handleSendBulkEmail,
  sendTestEmail,
  getEmailMetrics,
  saveEmailConfig,
  getEmailConfig,
  getReportedProfiles,
  dismissReport,
  sendAdminPushNotification,
  sendAdminEmail,
  getAdminPushNotifications,
  getPremiumUsers,
  getPaymentHistory,
  getPotentialMatches,
  sendPushNotification,
  sendMatchSuggestions
} = require('../controllers/adminController');
const { getAllPayments, processRefund } = require('../controllers/paymentController');
const { protect, admin } = require('../middlewares/authMiddleware');
const cache = require('../middlewares/cache');
const multer = require('multer');
const path = require('path');
const { runAll: runSqlBackfill } = require('../controllers/sqlBackfillController');

// Multer config for email attachments
const emailAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
});

// All admin routes require authentication and admin privileges
router.use(protect, admin);

// Admin dashboard routes
router.get('/statistics', cache(3600), getStats); // Cache for 1 hour
router.get('/users', getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser).delete(deleteUser);
router.put('/users/:id/status', updateUserAccountStatus);
router.put('/users/:id/plan', updateUserPlan);
router.post('/users/:id/verify-email', verifyUserEmail);
router.post('/users/:id/reset-password', sendPasswordResetLink);
router.get('/users/:id/potential-matches', getPotentialMatches);
router.post('/users/:id/impersonate', (req, res) => res.json({ token: 'test-impersonation-token', user: { username: 'impersonated' } }));
router.post('/users/:id/send-suggestions', sendMatchSuggestions);
router.post('/users/:id/test-push', (req, res) => res.json({ message: 'Test push sent' }));

// Call management
router.route('/calls').get(getAllCalls).post(saveCallRecord);

// Reports
router.get('/reported-profiles', getReportedProfiles);
router.put('/reports/:id/dismiss', dismissReport);
router.post('/reports/:id/action', (req, res) => res.json({ message: 'Action taken' }));

// Email marketing
router.post('/bulk-email', emailAttachmentUpload.array('attachments', 5), handleSendBulkEmail);
router.post('/test-email', sendTestEmail);
router.post('/push-notifications', sendAdminPushNotification);
router.get('/email-metrics', getEmailMetrics);
router.route('/email-config').get(getEmailConfig).post(saveEmailConfig);
router.post('/send-email', sendAdminEmail);

// Payments
router.get('/payments', getAllPayments);
router.post('/payments/:id/refund', processRefund);

// Push Notifications
router.route('/push-notifications').get(getAdminPushNotifications).post(sendAdminPushNotification);

// Placeholder routes for missing endpoints
router.get('/subscriptions', (req, res) => res.json([]));
router.get('/premium-users', getPremiumUsers);

// Scheduled Emails
router.get('/scheduled-emails', (req, res) => res.json([]));
router.delete('/scheduled-emails/:id', (req, res) => res.json({ message: 'Scheduled email deleted successfully' }));

// Migration & Backfill (admin only)
router.post('/sql-backfill/run', runSqlBackfill);

module.exports = router;
