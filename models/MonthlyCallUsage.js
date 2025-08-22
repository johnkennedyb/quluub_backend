const mongoose = require('mongoose');

const monthlyCallUsageSchema = new mongoose.Schema({
  // Match pair - always store in consistent order (smaller ID first)
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
  // Month and year for tracking
  month: { 
    type: Number, 
    required: true,
    min: 1,
    max: 12
  },
  year: { 
    type: Number, 
    required: true 
  },
  // Total seconds used this month (max 300 seconds = 5 minutes)
  totalSecondsUsed: { 
    type: Number, 
    default: 0,
    min: 0
  },
  // Individual call sessions this month
  callSessions: [{
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call' },
    duration: { type: Number, required: true }, // seconds
    date: { type: Date, default: Date.now },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  // Track when limit was reached
  limitReachedAt: { 
    type: Date 
  },
  // Last updated timestamp
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
monthlyCallUsageSchema.index({ user1: 1, user2: 1, month: 1, year: 1 }, { unique: true });

// Static method to get or create monthly usage record
monthlyCallUsageSchema.statics.getOrCreateMonthlyUsage = async function(userId1, userId2, month = null, year = null) {
  const now = new Date();
  const currentMonth = month || now.getMonth() + 1;
  const currentYear = year || now.getFullYear();
  
  // Always store user IDs in consistent order (smaller ID first)
  const [user1, user2] = [userId1, userId2].sort();
  
  let usage = await this.findOne({
    user1,
    user2,
    month: currentMonth,
    year: currentYear
  });
  
  if (!usage) {
    usage = await this.create({
      user1,
      user2,
      month: currentMonth,
      year: currentYear,
      totalSecondsUsed: 0,
      callSessions: []
    });
  }
  
  return usage;
};

// Static method to check if users have remaining call time
monthlyCallUsageSchema.statics.getRemainingTime = async function(userId1, userId2) {
  const MONTHLY_LIMIT_SECONDS = 300; // 5 minutes
  const usage = await this.getOrCreateMonthlyUsage(userId1, userId2);
  
  const remainingSeconds = Math.max(0, MONTHLY_LIMIT_SECONDS - usage.totalSecondsUsed);
  
  return {
    remainingSeconds,
    totalUsedSeconds: usage.totalSecondsUsed,
    monthlyLimitSeconds: MONTHLY_LIMIT_SECONDS,
    hasTimeRemaining: remainingSeconds > 0,
    usage
  };
};

// Static method to add call duration
monthlyCallUsageSchema.statics.addCallDuration = async function(userId1, userId2, duration, callId, initiatedBy) {
  const usage = await this.getOrCreateMonthlyUsage(userId1, userId2);
  
  // Add the call session
  usage.callSessions.push({
    callId,
    duration,
    date: new Date(),
    initiatedBy
  });
  
  // Update total seconds used
  usage.totalSecondsUsed += duration;
  usage.lastUpdated = new Date();
  
  // Mark limit reached if applicable
  if (usage.totalSecondsUsed >= 300 && !usage.limitReachedAt) {
    usage.limitReachedAt = new Date();
  }
  
  await usage.save();
  return usage;
};

// Instance method to format remaining time
monthlyCallUsageSchema.methods.getFormattedRemainingTime = function() {
  const MONTHLY_LIMIT_SECONDS = 300;
  const remainingSeconds = Math.max(0, MONTHLY_LIMIT_SECONDS - this.totalSecondsUsed);
  
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

module.exports = mongoose.model('MonthlyCallUsage', monthlyCallUsageSchema);
