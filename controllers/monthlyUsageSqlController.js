const monthlyRepo = require('../repositories/monthlyCallUsageRepository');

// GET /api/monthly-usage/video-call/:recipientId
async function getRemainingVideoCallTime(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const { recipientId } = req.params;
    if (!recipientId) return res.status(400).json({ message: 'Recipient ID is required' });

    const timeCheck = await monthlyRepo.getRemainingTime(userId, recipientId);

    const remainingMinutes = Math.floor(timeCheck.remainingSeconds / 60);
    const remainingSecondsOnly = timeCheck.remainingSeconds % 60;
    const formattedRemainingTime = `${remainingMinutes}:${remainingSecondsOnly.toString().padStart(2, '0')}`;

    const usedMinutes = Math.floor(timeCheck.totalUsedSeconds / 60);
    const usedSecondsOnly = timeCheck.totalUsedSeconds % 60;
    const formattedUsedTime = `${usedMinutes}:${usedSecondsOnly.toString().padStart(2, '0')}`;

    return res.json({
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
        year: new Date().getFullYear(),
      },
    });
  } catch (error) {
    console.error('Error getting monthly video call usage (SQL):', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

// GET /api/monthly-usage/video-call-history/:recipientId
async function getVideoCallHistory(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const { recipientId } = req.params;
    if (!recipientId) return res.status(400).json({ message: 'Recipient ID is required' });

    const timeCheck = await monthlyRepo.getRemainingTime(userId, recipientId);

    const formattedTotalUsed = `${Math.floor(timeCheck.totalUsedSeconds / 60)}:${(timeCheck.totalUsedSeconds % 60)
      .toString()
      .padStart(2, '0')}`;

    // SQL version does not track per-call sessions in this table; return empty list with totals
    const formattedSessions = [];

    return res.json({
      success: true,
      data: {
        totalSessions: formattedSessions.length,
        totalUsedSeconds: timeCheck.totalUsedSeconds,
        formattedTotalUsed,
        sessions: formattedSessions,
        limitReachedAt: null,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      },
    });
  } catch (error) {
    console.error('Error getting monthly video call history (SQL):', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

module.exports = { getRemainingVideoCallTime, getVideoCallHistory };
