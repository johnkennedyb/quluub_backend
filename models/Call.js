
const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  caller: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  roomId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  status: { 
    type: String, 
    enum: ['ringing', 'ongoing', 'completed', 'missed', 'declined', 'failed'],
    default: 'ringing'
  },
  startedAt: { 
    type: Date 
  },
  endedAt: { 
    type: Date 
  },
  duration: { 
    type: Number, 
    default: 0 
  }, // in seconds
  quality: { 
    type: String, 
    enum: ['good', 'fair', 'poor'], 
    default: 'good' 
  },
  // Legacy fields for backward compatibility
  conversationId: { 
    type: String 
  },
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date }
  }],
  recordingUrl: { type: String }
}, {
  timestamps: true
});

// Index for efficient queries
callSchema.index({ roomId: 1 });
callSchema.index({ caller: 1, recipient: 1 });
callSchema.index({ status: 1 });

module.exports = mongoose.model('Call', callSchema);
