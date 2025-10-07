const VideoCallTime = require('../models/VideoCallTime');
const User = require('../models/User');

// Get video call time information for a pair of users
exports.getVideoCallTimeInfo = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    
    // Validate that both users exist
    const [user1, user2] = await Promise.all([
      User.findById(userId1),
      User.findById(userId2)
    ]);
    
    if (!user1 || !user2) {
      return res.status(404).json({ 
        success: false, 
        message: 'One or both users not found' 
      });
    }

    // Get or create the video call time record
    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    
    res.json({
      success: true,
      data: {
        totalTimeSpent: record.totalTimeSpent,
        maxAllowedTime: record.maxAllowedTime,
        remainingTime: record.getRemainingTime(),
        canMakeVideoCall: record.canMakeVideoCall(),
        limitExceeded: record.limitExceeded,
        callSessions: record.callSessions.length,
        lastCallDate: record.callSessions.length > 0 
          ? record.callSessions[record.callSessions.length - 1].startTime 
          : null
      }
    });
  } catch (error) {
    console.error('Error getting video call time info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get video call time information' 
    });
  }
};

// Check if users can make a video call
exports.canMakeVideoCall = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    
    // Validate user IDs are provided
    if (!userId1 || !userId2 || userId1 === 'undefined' || userId2 === 'undefined') {
      console.error('Invalid user IDs provided:', { userId1, userId2 });
      return res.status(200).json({ // Return 200 with default values instead of 400
        success: false, 
        message: 'Invalid user IDs provided',
        canCall: true, // Default to allowing call
        remainingTime: 300 // Default 5 minutes
      });
    }
    
    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    const canCall = record.canMakeVideoCall();
    const remainingTime = record.getRemainingTime();
    
    console.log(`📊 Video call time check for ${userId1}-${userId2}:`, {
      totalTimeSpent: record.totalTimeSpent,
      remainingTime,
      canCall,
      limitExceeded: record.limitExceeded
    });
    
    res.json({
      success: true,
      canCall,
      remainingTime,
      totalTimeSpent: record.totalTimeSpent,
      limitExceeded: record.limitExceeded,
      message: canCall 
        ? `You have ${Math.floor(remainingTime / 60)} minutes and ${remainingTime % 60} seconds remaining`
        : 'Video call time limit exceeded for this match'
    });
  } catch (error) {
    console.error('Error checking video call permission:', error);
    // Return permissive defaults on error to avoid blocking calls
    res.status(200).json({ 
      success: false, 
      message: 'Failed to check video call permission - defaulting to allow',
      canCall: true, // Default to allowing call
      remainingTime: 300 // Default 5 minutes
    });
  }
};

// Start a video call session
exports.startVideoCallSession = async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    const callType = req.body.callType || 'video';
    
    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    
    if (!record.canMakeVideoCall()) {
      return res.status(403).json({
        success: false,
        message: 'Video call time limit exceeded for this pair',
        limitExceeded: true
      });
    }

    const session = record.startCallSession(callType);
    await record.save();
    
    res.json({
      success: true,
      sessionId: session._id,
      remainingTime: record.getRemainingTime(),
      message: 'Video call session started'
    });
  } catch (error) {
    console.error('Error starting video call session:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to start video call session' 
    });
  }
};

// End a video call session
exports.endVideoCallSession = async (req, res) => {
  try {
    const { userId1, userId2, sessionId } = req.body;
    const endTime = req.body.endTime ? new Date(req.body.endTime) : new Date();
    
    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    
    const session = record.endCallSession(sessionId, endTime);
    await record.save();
    
    res.json({
      success: true,
      sessionDuration: session.duration,
      totalTimeSpent: record.totalTimeSpent,
      remainingTime: record.getRemainingTime(),
      limitExceeded: record.limitExceeded,
      message: record.limitExceeded 
        ? 'Video call ended. Time limit reached - no more video calls allowed'
        : `Video call ended. ${Math.floor(record.getRemainingTime() / 60)} minutes remaining`
    });
  } catch (error) {
    console.error('Error ending video call session:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to end video call session' 
    });
  }
};

// Add call time directly (for existing/completed calls)
exports.addCallTime = async (req, res) => {
  try {
    const { userId1, userId2, durationInSeconds } = req.body;
    const callType = req.body.callType || 'video';
    
    if (!durationInSeconds || durationInSeconds <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration provided'
      });
    }

    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    
    const session = record.addCallTime(durationInSeconds, callType);
    await record.save();
    
    res.json({
      success: true,
      sessionDuration: session.duration,
      totalTimeSpent: record.totalTimeSpent,
      remainingTime: record.getRemainingTime(),
      limitExceeded: record.limitExceeded,
      message: record.limitExceeded 
        ? 'Time limit reached - no more video calls allowed between this pair'
        : `Call time added. ${Math.floor(record.getRemainingTime() / 60)} minutes remaining`
    });
  } catch (error) {
    console.error('Error adding call time:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add call time' 
    });
  }
};

// Get all video call pairs for a user (admin function)
exports.getUserVideoCallPairs = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const records = await VideoCallTime.find({
      $or: [{ user1: userId }, { user2: userId }]
    }).populate('user1 user2', 'fname lname username');
    
    const pairs = records.map(record => {
      const otherUser = record.user1._id.toString() === userId 
        ? record.user2 
        : record.user1;
      
      return {
        pairId: record._id,
        otherUser: {
          _id: otherUser._id,
          name: `${otherUser.fname} ${otherUser.lname}`,
          username: otherUser.username
        },
        totalTimeSpent: record.totalTimeSpent,
        remainingTime: record.getRemainingTime(),
        limitExceeded: record.limitExceeded,
        totalCalls: record.callSessions.length,
        lastCallDate: record.callSessions.length > 0 
          ? record.callSessions[record.callSessions.length - 1].startTime 
          : null
      };
    });
    
    res.json({
      success: true,
      pairs
    });
  } catch (error) {
    console.error('Error getting user video call pairs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get video call pairs' 
    });
  }
};

// Reset video call time for a pair (admin function)
exports.resetVideoCallTime = async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    
    const record = await VideoCallTime.getOrCreatePairRecord(userId1, userId2);
    
    record.totalTimeSpent = 0;
    record.limitExceeded = false;
    record.callSessions = [];
    record.updatedAt = new Date();
    
    await record.save();
    
    res.json({
      success: true,
      message: 'Video call time reset successfully'
    });
  } catch (error) {
    console.error('Error resetting video call time:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset video call time' 
    });
  }
};
