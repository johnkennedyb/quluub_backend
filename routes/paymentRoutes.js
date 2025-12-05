const express = require('express');
const router = express.Router();
const { createCheckoutSession, handleStripeWebhook, createPaystackPayment, handlePaystackWebhook, verifyPaymentAndUpgrade, verifyStripeSession } = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');

// @route   POST /api/payments/create-checkout-session
// @desc    Create a Stripe checkout session
// @access  Private
router.post('/create-checkout-session', protect, createCheckoutSession);

// Webhook is registered early in server.js with express.raw() to preserve Stripe signature

// @route   POST /api/payments/create-paystack-payment
// @desc    Create a Paystack payment
// @access  Private
router.post('/create-paystack-payment', protect, createPaystackPayment);

// @route   POST /api/payments/paystack-webhook
// @desc    Handle Paystack webhooks
// @access  Public
router.post('/paystack-webhook', handlePaystackWebhook);

// @route   POST /api/payments/verify-and-upgrade
// @desc    Manual payment verification and upgrade (fallback)
// @access  Private
router.post('/verify-and-upgrade', protect, verifyPaymentAndUpgrade);

// @route   POST /api/payments/verify-stripe-session
// @desc    Verify a Stripe Checkout session and upgrade user (fallback without webhooks)
// @access  Private
router.post('/verify-stripe-session', protect, verifyStripeSession);

module.exports = router;
