const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');

// @route   GET /api/monthly-usage/video-call/:recipientId
// @desc    Get remaining video call time for current month with specific match
// @access  Private
router.get('/video-call/:recipientId', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { recipientId } = req.params;

    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }

    // Get remaining time for this match pair
    const timeCheck = await MonthlyCallUsage.getRemainingTime(userId, recipientId);
    
    // Format remaining time
    const remainingMinutes = Math.floor(timeCheck.remainingSeconds / 60);
    const remainingSecondsOnly = timeCheck.remainingSeconds % 60;
    const formattedRemainingTime = `${remainingMinutes}:${remainingSecondsOnly.toString().padStart(2, '0')}`;
    
    // Format used time
    const usedMinutes = Math.floor(timeCheck.totalUsedSeconds / 60);
    const usedSecondsOnly = timeCheck.totalUsedSeconds % 60;
    const formattedUsedTime = `${usedMinutes}:${usedSecondsOnly.toString().padStart(2, '0')}`;

    res.json({
      success: true,
      data: {
        remainingSeconds: timeCheck.remainingSeconds,
        totalUsedSeconds: timeCheck.totalUsedSeconds,
        monthlyLimitSeconds: timeCheck.monthlyLimitSeconds,
        hasTimeRemaining: timeCheck.hasTimeRemaining,
        formattedRemainingTime,
        formattedUsedTime,
        limitReached: !timeCheck.hasTimeRemaining,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error getting monthly video call usage:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   GET /api/monthly-usage/video-call-history/:recipientId
// @desc    Get video call history for current month with specific match
// @access  Private
router.get('/video-call-history/:recipientId', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { recipientId } = req.params;

    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }

    // Get monthly usage record
    const usage = await MonthlyCallUsage.getOrCreateMonthlyUsage(userId, recipientId);
    
    // Format call sessions
    const formattedSessions = usage.callSessions.map(session => ({
      date: session.date,
      duration: session.duration,
      formattedDuration: `${Math.floor(session.duration / 60)}:${(session.duration % 60).toString().padStart(2, '0')}`,
      initiatedBy: session.initiatedBy
    }));

    res.json({
      success: true,
      data: {
        totalSessions: usage.callSessions.length,
        totalUsedSeconds: usage.totalSecondsUsed,
        formattedTotalUsed: `${Math.floor(usage.totalSecondsUsed / 60)}:${(usage.totalSecondsUsed % 60).toString().padStart(2, '0')}`,
        sessions: formattedSessions,
        limitReachedAt: usage.limitReachedAt,
        month: usage.month,
        year: usage.year
      }
    });
  } catch (error) {
    console.error('Error getting monthly video call history:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

module.exports = router;
