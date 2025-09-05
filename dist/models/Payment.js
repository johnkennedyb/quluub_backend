const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    status: {
      type: String,
      required: true,
      enum: ['succeeded', 'failed', 'refunded', 'pending'],
      default: 'pending',
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    paymentGateway: {
      type: String,
      required: true,
      default: 'Stripe',
    },
    plan: {
      type: String,
      enum: ['freemium', 'premium', 'pro'],
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

paymentSchema.virtual('id').get(function () {
  return this._id.toString();
});

module.exports = mongoose.model('Payment', paymentSchema);
