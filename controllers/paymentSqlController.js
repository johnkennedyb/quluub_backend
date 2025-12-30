const stripe = process.env.STRIPE_SECRET_API_KEY ? require('stripe')(process.env.STRIPE_SECRET_API_KEY) : null;
const axios = require('axios');
const crypto = require('crypto');
const userRepo = require('../repositories/userRepository');
const paymentRepo = require('../repositories/paymentRepository');

const FRONTEND_URL = process.env.FRONTEND_URL 
  || process.env.CLIENT_URL 
  || 'https://match.quluub.com';

const createCheckoutSession = async (req, res) => {
  const { plan, amount, currency } = req.body;
  const userId = (req.user._id || req.user.id).toString();
  try {
    if (!stripe) return res.status(500).json({ message: 'Stripe not configured' });
    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: (currency || 'gbp').toLowerCase(),
          product_data: { name: `${(plan || 'premium').charAt(0).toUpperCase() + (plan || 'premium').slice(1)} Plan` },
          unit_amount: Math.round(parsedAmount * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: userId,
      metadata: { userId, plan: plan || 'premium' },
      success_url: `${FRONTEND_URL}/settings?payment_success=true&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/settings?payment_canceled=true`,
    });
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating Stripe session (SQL):', error?.message || error);
    const msg = (error && (error.raw?.message || error.message)) || 'Server error';
    return res.status(500).json({ message: msg });
  }
};

const handleStripeWebhook = async (req, res) => {
  if (!stripe) return res.status(200).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET === 'whsec_YOUR_STRIPE_WEBHOOK_SECRET_HERE') {
      try { event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body; }
      catch (parseErr) { return res.status(400).send('Invalid JSON payload'); }
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
  } catch (err) {
    console.error('Stripe webhook signature verification failed (SQL):', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, plan } = session.metadata || {};
    const subscriptionId = session.subscription;
    try {
      let currentPeriodEnd = null;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription && subscription.current_period_end) {
          currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        }
      }
      if (userId) {
        await userRepo.updateById(userId, {
          plan: 'premium',
          premiumExpirationDate: currentPeriodEnd || null,
        });
        await paymentRepo.createPayment({
          userId,
          amount: (session.amount_total || 0) / 100,
          currency: (session.currency || 'gbp').toUpperCase(),
          status: 'succeeded',
          transactionId: session.id,
          paymentGateway: 'Stripe',
          plan: plan || 'premium',
        });
      }
    } catch (error) {
      console.error('Error processing Stripe checkout.session.completed (SQL):', error);
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    try {
      // Optional: look up user by stripe customer id if stored
    } catch (error) {}
  }
  res.json({ received: true });
};

const createPaystackPayment = async (req, res) => {
  const { plan, amount } = req.body;
  const userId = (req.user._id || req.user.id).toString();
  try {
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const reference = `quluub_${userId}_${Date.now()}`;
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: amount,
        reference: reference,
        callback_url: `${FRONTEND_URL}/payment-success?payment_success=true&provider=paystack&trxref=${reference}`,
        metadata: { user_id: userId, plan: plan, cancel_action: `${FRONTEND_URL}/settings?payment_canceled=true` },
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_API_KEY}` } }
    );
    res.json({ url: paystackResponse.data.data.authorization_url });
  } catch (error) {
    console.error('Error creating Paystack payment (SQL):', error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const handlePaystackWebhook = async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_API_KEY;
  const rawPayload = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
  const hash = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).send('Webhook Error: Invalid signature');
  }
  let event;
  try { event = Buffer.isBuffer(req.body) ? JSON.parse(rawPayload) : req.body; }
  catch (e) { return res.status(400).send('Invalid JSON payload'); }
  if (event.event === 'charge.success') {
    const { plan, user_id } = event.data.metadata || {};
    try {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      await userRepo.updateById(user_id, { plan: 'premium', premiumExpirationDate: expirationDate });
      await paymentRepo.createPayment({
        userId: user_id,
        amount: (event.data.amount || 0) / 100,
        currency: (event.data.currency || 'NGN').toUpperCase(),
        status: 'succeeded',
        transactionId: event.data.reference,
        paymentGateway: 'Paystack',
        plan: plan || 'premium',
      });
    } catch (error) {
      console.error('Error in Paystack charge.success (SQL):', error);
    }
  }
  res.sendStatus(200);
};

const verifyPaymentAndUpgrade = async (req, res) => {
  const userId = (req.user._id || req.user.id).toString();
  const { provider, reference } = req.body;
  try {
    let paymentVerified = false;
    let paystackTx = null;
    if (provider === 'paystack' && reference) {
      try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_API_KEY}` } });
        if (response.data.status && response.data.data.status === 'success') {
          paymentVerified = true;
          paystackTx = response.data.data;
        }
      } catch (error) {}
    }
    if (paymentVerified) {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      await userRepo.updateById(userId, { plan: 'premium', premiumExpirationDate: expirationDate });
      if (paystackTx) {
        await paymentRepo.createPayment({
          userId,
          amount: (paystackTx.amount || 0) / 100,
          currency: (paystackTx.currency || 'NGN').toUpperCase(),
          status: 'succeeded',
          transactionId: paystackTx.reference || reference,
          paymentGateway: 'Paystack',
          plan: (paystackTx.metadata && (paystackTx.metadata.plan || paystackTx.metadata?.plan?.toString())) || 'premium',
        });
      }
      res.json({ success: true });
    } else {
      res.status(400).json({ message: 'Payment verification failed' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const verifyStripeSession = async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ message: 'Stripe not configured' });
    const userId = (req.user._id || req.user.id).toString();
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ message: 'Missing sessionId' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const refUserId = session.client_reference_id || (session.metadata && session.metadata.userId);
    if (refUserId && refUserId.toString() !== userId.toString()) return res.status(403).json({ message: 'Session does not belong to user' });
    if ((session.payment_status !== 'paid') && (session.status !== 'complete')) return res.status(400).json({ message: 'Session not paid' });
    const subscriptionId = session.subscription;
    let currentPeriodEnd = null;
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id);
      if (sub && sub.current_period_end) currentPeriodEnd = new Date(sub.current_period_end * 1000);
    }
    await userRepo.updateById(userId, {
      plan: 'premium',
      premiumExpirationDate: currentPeriodEnd || null,
    });
    await paymentRepo.createPayment({
      userId,
      amount: (session.amount_total || 0) / 100,
      currency: (session.currency || 'gbp').toUpperCase(),
      status: 'succeeded',
      transactionId: session.id,
      paymentGateway: 'Stripe',
      plan: (session.metadata && session.metadata.plan) || 'premium',
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying Stripe session (SQL):', error?.message || error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createCheckoutSession,
  handleStripeWebhook,
  createPaystackPayment,
  handlePaystackWebhook,
  verifyPaymentAndUpgrade,
  verifyStripeSession,
};
