const mongoose = require('mongoose');

const pushNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      enum: ['all', 'premium', 'free', 'inactive', 'custom'],
      required: true,
    },
    targetUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['sent', 'scheduled', 'failed', 'draft'],
      default: 'draft',
    },
    sentAt: {
      type: Date,
    },
    scheduledFor: {
      type: Date,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PushNotification', pushNotificationSchema);
