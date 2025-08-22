const axios = require('axios');
const User = require('../models/User');

// Whereby API configuration
const WHEREBY_API_KEY = process.env.WHEREBY_API_KEY;
const WHEREBY_API_BASE_URL = 'https://api.whereby.dev/v1';

// Helper function to generate room name
const generateRoomName = (userId1, userId2) => {
  const timestamp = Date.now();
  return `quluub-call-${userId1.toString().slice(-4)}-${userId2.toString().slice(-4)}-${timestamp}`;
};

// @desc    Create a new Whereby room
// @route   POST /api/whereby/create-room
// @access  Private (Premium users only)
exports.createRoom = async (req, res) => {
  console.log('🎥 Whereby Room Creation Request:', {
    userId: req.user._id,
    requestBody: req.body,
    hasWherebyApiKey: !!WHEREBY_API_KEY
  });
  
  try {
    const userId = req.user._id;
    
    // Check if user is premium
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('👤 User plan check:', {
      userId: user._id,
      currentPlan: user.plan,
      isPremium: user.plan === 'premium' || user.plan === 'pro'
    });
    
    if (user.plan !== 'premium' && user.plan !== 'pro') {
      console.log('❌ User not premium - access denied');
      return res.status(403).json({ 
        message: 'Video calls are available for Premium users only. Upgrade your plan to access this feature.',
        requiresUpgrade: true 
      });
    }
    
    const {
      roomName,
      isLocked = false,
      roomNamePrefix = 'Quluub Video Call',
      roomMode = 'normal',
      partnerId
    } = req.body;
    
    // Generate room name if not provided
    let finalRoomName = roomName || (partnerId ? 
      generateRoomName(userId, partnerId) : 
      `${roomNamePrefix} ${new Date().toLocaleDateString()}`
    );
    
    // Clean room name for Whereby API (only alphanumeric and spaces)
    finalRoomName = finalRoomName
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove all non-alphanumeric characters except spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
      
    // If room name is empty after cleaning, use a default
    if (!finalRoomName || finalRoomName.length === 0) {
      finalRoomName = `QuluubCall${Date.now()}`;
    }
    
    console.log('🏷️ Cleaned room name:', finalRoomName);
    
    console.log('🏠 Creating Whereby room:', {
      roomName: finalRoomName,
      isLocked,
      roomMode
    });
    
    // Create room data for Whereby API (simplified format)
    const roomData = {
      isLocked: false // Keep it simple for now
    };
    
    // Only add roomName if it's not empty and valid
    if (finalRoomName && finalRoomName.length > 0) {
      roomData.roomName = finalRoomName;
    }
    
    // Check if API key is available
    console.log('🔑 Whereby API Key check:', {
      hasApiKey: !!WHEREBY_API_KEY,
      keyLength: WHEREBY_API_KEY ? WHEREBY_API_KEY.length : 0,
      keyPrefix: WHEREBY_API_KEY ? WHEREBY_API_KEY.substring(0, 20) + '...' : 'None'
    });
    
    if (!WHEREBY_API_KEY || WHEREBY_API_KEY.trim() === '') {
      console.log('⚠️ No valid Whereby API key - creating simple room URL');
      // Fallback: create a simple whereby.com room URL with better formatting
      const cleanRoomName = finalRoomName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars except spaces
        .replace(/\s+/g, '-') // Replace spaces with single dash
        .replace(/-+/g, '-') // Replace multiple dashes with single dash
        .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
      
      const simpleRoomUrl = `https://whereby.com/${cleanRoomName}`;
      
      console.log('🔗 Generated simple room URL:', simpleRoomUrl);
      
      return res.json({
        meetingId: `simple-${Date.now()}`,
        roomUrl: simpleRoomUrl,
        hostRoomUrl: simpleRoomUrl,
        roomName: finalRoomName,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        isSimpleRoom: true
      });
    }
    
    console.log('🌐 Making Whereby API request...');
    console.log('📋 Request data:', JSON.stringify(roomData, null, 2));
    const response = await axios.post(
      `${WHEREBY_API_BASE_URL}/rooms`,
      roomData,
      {
        headers: {
          'Authorization': `Bearer ${WHEREBY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const room = response.data;
    
    console.log('✅ Whereby room created successfully:', room.meetingId);
    
    res.json({
      meetingId: room.meetingId,
      roomUrl: room.roomUrl,
      hostRoomUrl: room.hostRoomUrl,
      roomName: finalRoomName,
      startDate: room.startDate,
      endDate: room.endDate
    });
    
  } catch (error) {
    console.error('❌ Error creating Whereby room:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    if (error.response?.status === 401) {
      return res.status(500).json({ 
        message: 'Whereby API authentication failed. Please contact support.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create video call room',
      error: error.response?.data?.message || error.message 
    });
  }
};

// @desc    Get room details
// @route   GET /api/whereby/room/:meetingId
// @access  Private (Premium users only)
exports.getRoom = async (req, res) => {
  try {
    const userId = req.user._id;
    const { meetingId } = req.params;
    
    // Check if user is premium
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.plan !== 'premium' && user.plan !== 'pro') {
      return res.status(403).json({ 
        message: 'Video calls are available for Premium users only. Upgrade your plan to access this feature.',
        requiresUpgrade: true 
      });
    }
    
    if (!WHEREBY_API_KEY) {
      return res.status(503).json({ 
        message: 'Whereby API not configured. Please contact support.' 
      });
    }
    
    console.log('📋 Getting Whereby room details:', meetingId);
    
    const response = await axios.get(
      `${WHEREBY_API_BASE_URL}/meetings/${meetingId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHEREBY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const room = response.data;
    
    res.json({
      meetingId: room.meetingId,
      roomUrl: room.roomUrl,
      hostRoomUrl: room.hostRoomUrl,
      startDate: room.startDate,
      endDate: room.endDate
    });
    
  } catch (error) {
    console.error('Error getting Whereby room:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    res.status(500).json({ 
      message: 'Failed to get room details',
      error: error.response?.data?.message || error.message 
    });
  }
};

// @desc    Delete a room
// @route   DELETE /api/whereby/room/:meetingId
// @access  Private (Premium users only)
exports.deleteRoom = async (req, res) => {
  try {
    const userId = req.user._id;
    const { meetingId } = req.params;
    
    // Check if user is premium
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.plan !== 'premium' && user.plan !== 'pro') {
      return res.status(403).json({ 
        message: 'Video calls are available for Premium users only. Upgrade your plan to access this feature.',
        requiresUpgrade: true 
      });
    }
    
    if (!WHEREBY_API_KEY) {
      // For simple rooms, we can't actually delete them, just return success
      return res.json({ message: 'Room session ended' });
    }
    
    console.log('🗑️ Deleting Whereby room:', meetingId);
    
    await axios.delete(
      `${WHEREBY_API_BASE_URL}/meetings/${meetingId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHEREBY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Whereby room deleted successfully');
    
    res.json({ message: 'Room deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting Whereby room:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    res.status(500).json({ 
      message: 'Failed to delete room',
      error: error.response?.data?.message || error.message 
    });
  }
};

module.exports = {
  createRoom: exports.createRoom,
  getRoom: exports.getRoom,
  deleteRoom: exports.deleteRoom
};
