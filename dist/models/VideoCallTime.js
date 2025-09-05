const mongoose = require('mongoose');

const videoCallTimeSchema = new mongoose.Schema({
  // Pair of users (always store in consistent order: smaller ID first)
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Total time spent in video calls (in seconds)
  totalTimeSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  // Maximum allowed time (5 minutes = 300 seconds)
  maxAllowedTime: {
    type: Number,
    default: 300 // 5 minutes in seconds
  },
  // Whether this pair has exceeded their limit
  limitExceeded: {
    type: Boolean,
    default: false
  },
  // Array of individual call sessions for tracking
  callSessions: [{
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date
    },
    duration: {
      type: Number, // in seconds
      default: 0
    },
    callType: {
      type: String,
      enum: ['video', 'audio'],
      default: 'video'
    }
  }],
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique pairs and fast lookups
videoCallTimeSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Pre-save middleware to ensure user1 is always the smaller ObjectId
videoCallTimeSchema.pre('save', function(next) {
  if (this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
  }
  this.updatedAt = new Date();
  next();
});

// Static method to get or create video call time record for a pair
videoCallTimeSchema.statics.getOrCreatePairRecord = async function(userId1, userId2) {
  // Ensure consistent ordering
  const [user1, user2] = userId1.toString() < userId2.toString() 
    ? [userId1, userId2] 
    : [userId2, userId1];

  let record = await this.findOne({ user1, user2 });
  
  if (!record) {
    record = new this({ user1, user2 });
    await record.save();
  }
  
  return record;
};

// Method to check if pair can make video calls
videoCallTimeSchema.methods.canMakeVideoCall = function() {
  return !this.limitExceeded && this.totalTimeSpent < this.maxAllowedTime;
};

// Method to get remaining time in seconds
videoCallTimeSchema.methods.getRemainingTime = function() {
  return Math.max(0, this.maxAllowedTime - this.totalTimeSpent);
};

// Method to start a new call session
videoCallTimeSchema.methods.startCallSession = function(callType = 'video') {
  if (!this.canMakeVideoCall()) {
    throw new Error('Video call time limit exceeded for this pair');
  }

  const session = {
    startTime: new Date(),
    callType
  };
  
  this.callSessions.push(session);
  return this.callSessions[this.callSessions.length - 1];
};

// Method to end a call session and update total time
videoCallTimeSchema.methods.endCallSession = function(sessionId, endTime = new Date()) {
  const session = this.callSessions.id(sessionId);
  if (!session || session.endTime) {
    throw new Error('Invalid or already ended call session');
  }

  session.endTime = endTime;
  session.duration = Math.floor((endTime - session.startTime) / 1000); // duration in seconds

  // Update total time spent
  this.totalTimeSpent += session.duration;

  // Check if limit is exceeded
  if (this.totalTimeSpent >= this.maxAllowedTime) {
    this.limitExceeded = true;
  }

  this.updatedAt = new Date();
  return session;
};

// Method to add time directly (for existing calls)
videoCallTimeSchema.methods.addCallTime = function(durationInSeconds, callType = 'video') {
  const session = {
    startTime: new Date(Date.now() - (durationInSeconds * 1000)),
    endTime: new Date(),
    duration: durationInSeconds,
    callType
  };

  this.callSessions.push(session);
  this.totalTimeSpent += durationInSeconds;

  if (this.totalTimeSpent >= this.maxAllowedTime) {
    this.limitExceeded = true;
  }

  this.updatedAt = new Date();
  return session;
};

module.exports = mongoose.model('VideoCallTime', videoCallTimeSchema);
