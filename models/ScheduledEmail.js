const mongoose = require('mongoose');

const scheduledEmailSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  sendToAll: {
    type: Boolean,
    default: false,
  },
  sendAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  },
  attachments: [Object],
  lastAttempt: Date,
  error: String,
}, { timestamps: true });

module.exports = mongoose.model('ScheduledEmail', scheduledEmailSchema);
