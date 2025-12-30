const userRepo = require('../repositories/userRepository');
const notifRepo = require('../repositories/notificationRepository');
const monthlyRepo = require('../repositories/monthlyCallUsageRepository');
let StreamClientCtor = null;
try {
  ({ StreamClient: StreamClientCtor } = require('@stream-io/node-sdk'));
} catch (_) {
  StreamClientCtor = null;
}

// Prefer env vars; fall back to values used elsewhere if provided
const GETSTREAM_API_KEY = process.env.GETSTREAM_API_KEY || 'zkhmtk6srdk3';
const GETSTREAM_SECRET = process.env.GETSTREAM_SECRET || '7q7dumywgx4swpa2yqt52t5fvh47cvwg5svwmedms3mwu33mb9dqtujjzpvwxw9h';
const GETSTREAM_APP_ID = process.env.GETSTREAM_APP_ID || '1434472';

const streamClient = (StreamClientCtor && GETSTREAM_API_KEY && GETSTREAM_SECRET)
  ? new StreamClientCtor(GETSTREAM_API_KEY, GETSTREAM_SECRET)
  : null;

async function generateSessionToken(req, res) {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required for professional session token' });

    if (!streamClient) {
      return res.status(503).json({ success: false, message: 'GetStream is not configured' });
    }
    try {
      const dbUser = await userRepo.findById(userId);
      const displayName = (dbUser?.fname || dbUser?.username || dbUser?._id || userId || '').toString();
      await streamClient.upsertUsers([{ id: userId, role: 'user', name: displayName, custom: {} }]);
    } catch (_) {}

    const token = streamClient.generateUserToken({ user_id: userId });
    return res.json({ success: true, token, apiKey: GETSTREAM_API_KEY, appId: GETSTREAM_APP_ID });
  } catch (error) {
    console.error('getstream SQL generateSessionToken error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate professional session token', error: error.message });
  }
}

async function createProfessionalSession(req, res) {
  try {
    const hostId = (req.user._id || req.user.id).toString();
    const { participantId, sessionId, hostName, sessionType } = req.body || {};
    if (!participantId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Participant ID and Session ID are required for professional session' });
    }

    // Time limit check using SQL monthly usage
    const timeCheck = await monthlyRepo.getRemainingTime(hostId, participantId);
    if (!timeCheck.hasTimeRemaining) {
      return res.status(400).json({ success: false, message: 'Professional session time limit exceeded', timeLimit: true, totalSessionTime: timeCheck.totalUsedSeconds, sessionQuota: timeCheck.monthlyLimitSeconds });
    }

    // Upsert GetStream users best-effort
    if (streamClient) {
      try {
        const [hostDb, participantDb] = await Promise.all([userRepo.findById(hostId), userRepo.findById(participantId)]);
        await streamClient.upsertUsers([
          { id: hostId, role: 'user', name: hostName || hostDb?.fname || hostDb?.username || hostId, custom: {} },
          { id: participantId, role: 'user', name: participantDb?.fname || participantDb?.username || participantId, custom: {} },
        ]);
      } catch (_) {}
    }

    // Store invitation as SQL notification
    await notifRepo.createNotification({
      userId: participantId,
      type: 'getstream_video_call_invitation',
      message: `${hostName || 'Host'} is inviting you to a professional video session`,
      data: {
        callerId: hostId,
        callerName: hostName || 'Host',
        recipientId: participantId,
        sessionId,
        sessionType: sessionType || 'professional_video',
        timestamp: new Date().toISOString(),
        remainingTime: timeCheck.remainingSeconds,
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(participantId.toString()).emit('getstream_video_call_invitation', {
        callerId: hostId,
        callerName: hostName || 'Host',
        sessionId,
        callId: `call_${sessionId}`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(201).json({ success: true, message: 'Professional video session created successfully', sessionData: { sessionId, hostId, participantId, sessionType: sessionType || 'professional_video', status: 'pending', remainingTime: timeCheck.remainingSeconds } });
  } catch (error) {
    console.error('getstream SQL createProfessionalSession error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create professional video session', error: error.message });
  }
}

async function initiateGetStreamCall(req, res) {
  try {
    const callerId = (req.user._id || req.user.id).toString();
    const { recipientId, sessionId } = req.body || {};
    if (!recipientId || !sessionId) return res.status(400).json({ message: 'Recipient ID and session ID are required' });

    const [caller, recipient, timeCheck] = await Promise.all([
      userRepo.findById(callerId),
      userRepo.findById(recipientId),
      monthlyRepo.getRemainingTime(callerId, recipientId),
    ]);
    if (!caller) return res.status(404).json({ message: 'Caller not found' });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });
    if (!timeCheck.hasTimeRemaining) return res.status(403).json({ message: 'Time limit exceeded for video calls with this user', remainingTime: timeCheck.remainingSeconds });

    await notifRepo.createNotification({
      userId: recipientId,
      type: 'getstream_video_call_invitation',
      message: `${caller.fname || caller.username || 'Caller'} is calling you`,
      data: {
        callerId,
        callerName: caller.fname || caller.username,
        recipientId,
        recipientName: recipient.fname || recipient.username,
        sessionId,
        callId: `call_${sessionId}`,
        timestamp: new Date().toISOString(),
        remainingTime: timeCheck.remainingSeconds,
      },
    });

    return res.json({ message: 'GetStream video call invitation sent successfully', sessionId, callId: `call_${sessionId}`, recipientOnline: true, remainingTime: timeCheck.remainingSeconds });
  } catch (error) {
    console.error('getstream SQL initiate error:', error);
    return res.status(500).json({ message: 'Failed to initiate video call', error: error.message });
  }
}

async function getActiveInvitations(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const list = await notifRepo.listByUserAndTypeSince(userId, 'getstream_video_call_invitation', 5);
    const active = list.map((n) => ({
      _id: n.id,
      callerId: n.data?.callerId,
      callerName: n.data?.callerName,
      sessionId: n.data?.sessionId,
      callId: n.data?.callId,
      timestamp: n.createdAt,
      remainingTime: n.data?.remainingTime || 300,
    }));
    return res.json(active);
  } catch (error) {
    console.error('getstream SQL getActiveInvitations error:', error);
    return res.status(500).json({ message: 'Failed to fetch invitations', error: error.message });
  }
}

async function clearNotifications(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const { sessionId } = req.params;
    const deleted = await notifRepo.deleteByTypeAndSession(userId, 'getstream_video_call_invitation', sessionId);
    return res.json({ message: 'Notifications cleared successfully', deletedCount: deleted });
  } catch (error) {
    console.error('getstream SQL clearNotifications error:', error);
    return res.status(500).json({ message: 'Failed to clear notifications', error: error.message });
  }
}

module.exports = {
  generateSessionToken,
  createProfessionalSession,
  generateToken: generateSessionToken,
  initiateGetStreamCall,
  getActiveInvitations,
  clearNotifications,
};
