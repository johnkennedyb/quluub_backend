const stripe = process.env.STRIPE_SECRET_API_KEY ? require('stripe')(process.env.STRIPE_SECRET_API_KEY) : null;
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User');
const { sendPlanPurchasedEmail, sendPlanExpiringEmail, sendPlanExpiredEmail } = require('../utils/emailService');

// @desc    Create a Stripe checkout session
// @route   POST /api/payments/create-checkout-session
// @access  Private
const createCheckoutSession = async (req, res) => {
  const { plan, amount, currency } = req.body;
  const userId = req.user.id;

  try {
    if (!stripe) {
      return res.status(500).json({ message: 'Stripe not configured' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
            },
            unit_amount: amount * 100, // Amount in smallest currency unit (e.g., pence)
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        plan: plan || 'premium', // Default to premium if not provided
      },
      success_url: `${process.env.CLIENT_URL}/settings?payment_success=true&provider=stripe`,
      cancel_url: `${process.env.CLIENT_URL}/settings?payment_canceled=true`,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating Stripe session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Handle Stripe webhooks
// @route   POST /api/payments/webhook
// @access  Public
const handleStripeWebhook = async (req, res) => {
  console.log('Stripe webhook received:', req.headers['stripe-signature'] ? 'with signature' : 'without signature');
  
  if (!stripe) {
    console.warn('Stripe not configured, skipping webhook processing');
    return res.status(200).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Check if webhook secret is configured
    if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET === 'whsec_YOUR_STRIPE_WEBHOOK_SECRET_HERE') {
      console.warn('Stripe webhook secret not configured, skipping signature verification');
      event = req.body;
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
  } catch (err) {
    console.error(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Processing checkout.session.completed:', JSON.stringify(session, null, 2));
    const { userId, plan } = session.metadata;
    const subscriptionId = session.subscription;
    console.log(`User ID: ${userId}, Plan: ${plan}, Subscription ID: ${subscriptionId}`);

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      console.log('Retrieved subscription from Stripe:', JSON.stringify(subscription, null, 2));
      const user = await User.findById(userId);
      if (user) {
        console.log(`Found user: ${user.email}, current plan: ${user.plan}`);
        // Immediately upgrade user to premium
        user.plan = 'premium';
        user.premiumExpirationDate = new Date(subscription.current_period_end * 1000);
        
        // Update subscription details if subscription field exists
        if (user.subscription) {
          user.subscription.status = 'active';
          user.subscription.plan = plan;
          user.subscription.stripeSubscriptionId = subscriptionId;
          user.subscription.stripeCustomerId = session.customer;
          user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        }
        
        console.log('User object before saving:', JSON.stringify(user, null, 2));
        await user.save();
        console.log(`Successfully upgraded user ${userId} to premium plan, expires: ${user.premiumExpirationDate}`);
        
        // Create payment record
        const Payment = require('../models/Payment');
        try {
          const paymentRecord = new Payment({
            user: userId,
            amount: session.amount_total / 100, // Convert from cents
            currency: session.currency.toUpperCase(),
            status: 'succeeded',
            transactionId: session.id,
            paymentGateway: 'Stripe',
            plan: plan || 'premium'
          });
          await paymentRecord.save();
          console.log('Payment record created successfully');
        } catch (paymentError) {
          console.error('Error creating payment record:', paymentError);
        }
        
        sendPlanPurchasedEmail(user.email, user.fname);
      } else {
        console.error(`User with ID ${userId} not found.`);
      }
    } catch (error) {
      console.error('Error in checkout.session.completed:', error);
    }
  } else if (event.type === 'invoice.upcoming') {
    const invoice = event.data.object;
    const customerId = invoice.customer;
    try {
      const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
      if (user) {
        console.log(`Sending plan expiring email to ${user.email}`);
        sendPlanExpiringEmail(user.email, user.fname);
      }
    } catch (error) {
      console.error('Error in invoice.upcoming:', error);
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    try {
      const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
      if (user) {
        // Downgrade user from premium
        user.plan = 'freemium';
        user.premiumExpirationDate = null;
        
        // Update subscription details if subscription field exists
        if (user.subscription) {
          user.subscription.status = 'expired';
        }
        
        await user.save();
        console.log(`Subscription expired for user ${user.email}, downgraded to freemium`);
        sendPlanExpiredEmail(user.email, user.fname);
      }
    } catch (error) {
      console.error('Error in customer.subscription.deleted:', error);
    }
  }

  res.json({ received: true });
};

// @desc    Get all payments
// @route   GET /api/admin/payments
// @access  Private/Admin
const getAllPayments = async (req, res) => {
  try {
    const Payment = require('../models/Payment');
    const payments = await Payment.find({})
      .populate('user', 'fname lname email')
      .sort({ createdAt: -1 })
      .limit(100); // Limit to last 100 payments
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Process a refund
// @route   POST /api/admin/payments/:id/refund
// @access  Private/Admin
const processRefund = async (req, res) => {
  try {
    // This is a placeholder. In a real application, you would integrate with Stripe's refund API.
    const { id } = req.params;
    console.log(`Refunding payment ${id}`);
    res.json({ message: `Refund for payment ${id} processed successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const createPaystackPayment = async (req, res) => {
  const { plan, amount } = req.body; // amount should be in kobo
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a unique reference for this transaction
    const reference = `quluub_${userId}_${Date.now()}`;
    
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: amount,
        reference: reference,
        callback_url: `${process.env.CLIENT_URL}/payment-success?payment_success=true&provider=paystack&trxref=${reference}`,
        metadata: {
          user_id: userId,
          plan: plan,
          cancel_action: `${process.env.CLIENT_URL}/settings?payment_canceled=true`
        },
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_API_KEY}`,
        },
      }
    );

    res.json({
      url: paystackResponse.data.data.authorization_url,
    });
  } catch (error) {
    console.error('Error creating Paystack payment:', error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const handlePaystackWebhook = async (req, res) => {
  console.log('Paystack webhook received:', JSON.stringify(req.body, null, 2));
  console.log('Paystack webhook headers:', req.headers);
  
  const secret = process.env.PAYSTACK_SECRET_API_KEY;
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Paystack webhook signature verification failed.');
    console.error('Expected hash:', hash);
    console.error('Received signature:', req.headers['x-paystack-signature']);
    return res.status(400).send('Webhook Error: Invalid signature');
  }

  const event = req.body;
  console.log('Processing Paystack event:', event.event);

  if (event.event === 'charge.success') {
    const { email } = event.data.customer;
    const { plan, user_id } = event.data.metadata;
    console.log(`Processing charge.success for email: ${email}, user_id: ${user_id}, plan: ${plan}`);

    try {
      const user = await User.findById(user_id);
      if (user) {
        console.log(`Found user: ${user.email}, current plan: ${user.plan}`);
        
        // Immediately upgrade user to premium
        user.plan = 'premium';
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 1); // Set to 1 month from now
        user.premiumExpirationDate = expirationDate;

        console.log('User object before saving:', JSON.stringify(user, null, 2));
        await user.save();
        console.log(`Successfully upgraded user ${user.email} to premium plan, expires: ${expirationDate}`);
        
        // Create payment record
        const Payment = require('../models/Payment');
        try {
          const paymentRecord = new Payment({
            user: user_id,
            amount: event.data.amount / 100, // Convert from kobo to naira
            currency: event.data.currency.toUpperCase(),
            status: 'succeeded',
            transactionId: event.data.reference,
            paymentGateway: 'Paystack',
            plan: plan || 'premium'
          });
          await paymentRecord.save();
          console.log('Payment record created successfully');
        } catch (paymentError) {
          console.error('Error creating payment record:', paymentError);
        }
        
        sendPlanPurchasedEmail(user.email, user.fname);
      } else {
        console.error(`User not found with ID: ${user_id}`);
      }
    } catch (error) {
      console.error('Error in Paystack charge.success webhook:', error);
    }
  } else {
    console.log(`Ignoring Paystack event: ${event.event}`);
  }

  res.sendStatus(200);
};

// Manual payment verification endpoint (fallback if webhook fails)
const verifyPaymentAndUpgrade = async (req, res) => {
  const userId = req.user.id;
  const { provider, reference } = req.body;
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let paymentVerified = false;

    if (provider === 'paystack' && reference) {
      // Verify Paystack payment
      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_API_KEY}`,
            },
          }
        );
        
        if (response.data.status && response.data.data.status === 'success') {
          paymentVerified = true;
          console.log(`Paystack payment verified for user ${userId}, reference: ${reference}`);
        }
      } catch (error) {
        console.error('Error verifying Paystack payment:', error);
      }
    }

    if (paymentVerified) {
      // Upgrade user to premium
      user.plan = 'premium';
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      user.premiumExpirationDate = expirationDate;
      
      await user.save();
      console.log(`Manually upgraded user ${user.email} to premium after payment verification`);
      
      res.json({ 
        success: true, 
        message: 'Payment verified and user upgraded to premium',
        user: {
          plan: user.plan,
          premiumExpirationDate: user.premiumExpirationDate
        }
      });
    } else {
      res.status(400).json({ message: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Error in manual payment verification:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { 
  createCheckoutSession, 
  handleStripeWebhook, 
  createPaystackPayment,
  handlePaystackWebhook,
  getAllPayments,
  processRefund,
  verifyPaymentAndUpgrade
};
