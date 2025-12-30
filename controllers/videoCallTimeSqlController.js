const { v4: uuidv4 } = require('uuid');
const monthlyRepo = require('../repositories/monthlyCallUsageRepository');
const userRepo = require('../repositories/userRepository');

// In-memory active sessions: { sessionId: { userId1, userId2, startTime, callType } }
const activeSessions = new Map();

function toBool(v) {
  return v === true || v === 1 || v === '1';
}

// GET /api/video-call-time/info/:userId1/:userId2
async function getVideoCallTimeInfo(req, res) {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2) return res.status(400).json({ success: false, message: 'Missing user ids' });

    const time = await monthlyRepo.getRemainingTime(userId1, userId2);
    return res.json({
      success: true,
      data: {
        totalTimeSpent: time.totalUsedSeconds,
        maxAllowedTime: time.monthlyLimitSeconds,
        remainingTime: time.remainingSeconds,
        canMakeVideoCall: time.hasTimeRemaining,
        limitExceeded: !time.hasTimeRemaining || toBool(time.limitExceeded),
        callSessions: 0,
        lastCallDate: null,
      },
    });
  } catch (err) {
    console.error('SQL getVideoCallTimeInfo error:', err);
    return res.status(500).json({ success: false, message: 'Failed to get video call time information' });
  }
}

// GET /api/video-call-time/can-call/:userId1/:userId2
async function canMakeVideoCall(req, res) {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2) {
      return res.status(200).json({ success: false, message: 'Invalid user IDs provided', canCall: true, remainingTime: 300 });
    }
    const time = await monthlyRepo.getRemainingTime(userId1, userId2);
    return res.json({
      success: true,
      canCall: time.hasTimeRemaining,
      remainingTime: time.remainingSeconds,
      totalTimeSpent: time.totalUsedSeconds,
      limitExceeded: !time.hasTimeRemaining || toBool(time.limitExceeded),
      message: time.hasTimeRemaining
        ? `You have ${Math.floor(time.remainingSeconds / 60)} minutes and ${time.remainingSeconds % 60} seconds remaining`
        : 'Video call time limit exceeded for this match',
    });
  } catch (err) {
    console.error('SQL canMakeVideoCall error:', err);
    return res.status(200).json({ success: false, message: 'Failed to check video call permission - defaulting to allow', canCall: true, remainingTime: 300 });
  }
}

// POST /api/video-call-time/start-session
async function startVideoCallSession(req, res) {
  try {
    const { userId1, userId2, callType = 'video' } = req.body || {};
    if (!userId1 || !userId2) return res.status(400).json({ success: false, message: 'Missing user ids' });

    const time = await monthlyRepo.getRemainingTime(userId1, userId2);
    if (!time.hasTimeRemaining) {
      return res.status(403).json({ success: false, message: 'Video call time limit exceeded for this pair', limitExceeded: true });
    }

    const sessionId = uuidv4();
    activeSessions.set(sessionId, { userId1: String(userId1), userId2: String(userId2), callType, startTime: Date.now() });

    return res.json({ success: true, sessionId, remainingTime: time.remainingSeconds, message: 'Video call session started' });
  } catch (err) {
    console.error('SQL startVideoCallSession error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to start video call session' });
  }
}

// POST /api/video-call-time/end-session
async function endVideoCallSession(req, res) {
  try {
    const { userId1, userId2, sessionId } = req.body || {};
    if (!userId1 || !userId2 || !sessionId) return res.status(400).json({ success: false, message: 'Missing parameters' });

    const sess = activeSessions.get(sessionId);
    if (!sess) {
      return res.status(400).json({ success: false, message: 'Invalid sessionId' });
    }

    activeSessions.delete(sessionId);
    const duration = Math.max(0, Math.floor((Date.now() - (sess.startTime || Date.now())) / 1000));

    try {
      await monthlyRepo.addCallDuration(userId1, userId2, duration);
    } catch (e) {
      console.error('Failed to add call duration to SQL monthly usage:', e?.message || e);
    }

    const time = await monthlyRepo.getRemainingTime(userId1, userId2);

    return res.json({
      success: true,
      sessionDuration: duration,
      totalTimeSpent: time.totalUsedSeconds,
      remainingTime: time.remainingSeconds,
      limitExceeded: !time.hasTimeRemaining || toBool(time.limitExceeded),
      message: time.hasTimeRemaining
        ? `Video call ended. ${Math.floor(time.remainingSeconds / 60)} minutes remaining`
        : 'Video call ended. Time limit reached - no more video calls allowed',
    });
  } catch (err) {
    console.error('SQL endVideoCallSession error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to end video call session' });
  }
}

// POST /api/video-call-time/add-time
async function addCallTime(req, res) {
  try {
    const { userId1, userId2, durationInSeconds } = req.body || {};
    if (!userId1 || !userId2 || !durationInSeconds || durationInSeconds <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid parameters' });
    }

    await monthlyRepo.addCallDuration(userId1, userId2, durationInSeconds);
    const time = await monthlyRepo.getRemainingTime(userId1, userId2);

    return res.json({
      success: true,
      sessionDuration: durationInSeconds,
      totalTimeSpent: time.totalUsedSeconds,
      remainingTime: time.remainingSeconds,
      limitExceeded: !time.hasTimeRemaining || toBool(time.limitExceeded),
      message: time.hasTimeRemaining
        ? `Call time added. ${Math.floor(time.remainingSeconds / 60)} minutes remaining`
        : 'Time limit reached - no more video calls allowed between this pair',
    });
  } catch (err) {
    console.error('SQL addCallTime error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add call time' });
  }
}

// GET /api/video-call-time/user-pairs/:userId
async function getUserVideoCallPairs(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user id' });

    const records = await monthlyRepo.listPairsForUser(userId);

    const pairs = await Promise.all(
      records.map(async (r) => {
        const otherId = r.user1 === String(userId) ? r.user2 : r.user1;
        let otherUser = null;
        try { otherUser = await userRepo.findById(otherId); } catch (_) {}
        return {
          pairId: `${r.user1}-${r.user2}-${r.month}`,
          otherUser: otherUser
            ? { _id: otherUser._id, name: `${otherUser.fname || ''} ${otherUser.lname || ''}`.trim(), username: otherUser.username }
            : { _id: otherId, name: 'User', username: null },
          totalTimeSpent: r.totalUsedSeconds || 0,
          remainingTime: Math.max(0, 300 - (r.totalUsedSeconds || 0)),
          limitExceeded: toBool(r.limitExceeded) || (r.totalUsedSeconds || 0) >= 300,
          totalCalls: 0,
          lastCallDate: null,
        };
      })
    );

    return res.json({ success: true, pairs });
  } catch (err) {
    console.error('SQL getUserVideoCallPairs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to get video call pairs' });
  }
}

// POST /api/video-call-time/reset
async function resetVideoCallTime(req, res) {
  try {
    const { userId1, userId2 } = req.body || {};
    if (!userId1 || !userId2) return res.status(400).json({ success: false, message: 'Missing user ids' });
    await monthlyRepo.resetUsage(userId1, userId2);
    return res.json({ success: true, message: 'Video call time reset successfully' });
  } catch (err) {
    console.error('SQL resetVideoCallTime error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset video call time' });
  }
}

module.exports = {
  getVideoCallTimeInfo,
  canMakeVideoCall,
  startVideoCallSession,
  endVideoCallSession,
  addCallTime,
  getUserVideoCallPairs,
  resetVideoCallTime,
};
