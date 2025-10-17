const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['message', 'match', 'like', 'video_call', 'video_call_invitation', 'getstream_video_call_invitation', 'admin_announcement', 'system_alert'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: {
    type: String
  },
  read: {
    type: Boolean,
    default: false
  },
  // Structured data for different notification types
  data: {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    callerName: { type: String },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipientName: { type: String },
    sessionId: { type: String },
    callId: { type: String },
    timestamp: { type: String },
    remainingTime: { type: Number },
    // Add any other relevant data for different notification types
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);