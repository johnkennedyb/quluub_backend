const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  messageType: {
    type: String,
    enum: ['text', 'video_call_invitation'],
    default: 'text',
  },
  videoCallData: {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    callerName: { type: String },
    sessionId: { type: String },
    timestamp: { type: Date },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'ended', 'missed'], default: 'pending' }
  }
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
