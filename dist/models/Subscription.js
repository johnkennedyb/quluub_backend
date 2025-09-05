const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    plan: {
      type: String,
      required: true,
      enum: ['freemium', 'premium', 'pro'],
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'cancelled', 'expired', 'pending'],
      default: 'pending',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    paymentId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

subscriptionSchema.virtual('id').get(function () {
  return this._id.toString();
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
