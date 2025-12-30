const express = require('express');
const router = express.Router();
const paymentMongo = require('../controllers/paymentController');
const paymentSql = require('../controllers/paymentSqlController');
const { protect } = require('../middlewares/authMiddleware');
const { getPool } = require('../config/sql');

const choose = (sqlFn, mongoFn) => (req, res, next) => {
  const requireSql = process.env.SQL_REQUIRED === 'true';
  const useSqlFlag = requireSql || process.env.SQL_ENABLED === 'true';
  if (!useSqlFlag) return mongoFn(req, res, next);
  try { getPool(); return sqlFn(req, res, next); } catch (e) {
    if (requireSql) return res.status(503).json({ message: 'SQL is required but unavailable' });
    return mongoFn(req, res, next);
  }
};

// @route   POST /api/payments/create-checkout-session
// @desc    Create a Stripe checkout session
// @access  Private
router.post('/create-checkout-session', protect, choose(paymentSql.createCheckoutSession, paymentMongo.createCheckoutSession));

// Webhook is registered early in server.js with express.raw() to preserve Stripe signature

// @route   POST /api/payments/create-paystack-payment
// @desc    Create a Paystack payment
// @access  Private
router.post('/create-paystack-payment', protect, choose(paymentSql.createPaystackPayment, paymentMongo.createPaystackPayment));

// Note: Webhooks are mounted early in server.js with express.raw() to preserve raw body

// @route   POST /api/payments/verify-and-upgrade
// @desc    Manual payment verification and upgrade (fallback)
// @access  Private
router.post('/verify-and-upgrade', protect, choose(paymentSql.verifyPaymentAndUpgrade, paymentMongo.verifyPaymentAndUpgrade));

// @route   POST /api/payments/verify-stripe-session
// @desc    Verify a Stripe Checkout session and upgrade user (fallback without webhooks)
// @access  Private
router.post('/verify-stripe-session', protect, choose(paymentSql.verifyStripeSession, paymentMongo.verifyStripeSession));

module.exports = router;
