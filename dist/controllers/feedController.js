const User = require('../models/User');
const Relationship = require('../models/Relationship');
const Chat = require('../models/Chat');
const UserActivityLog = require('../models/UserActivityLog');

// @desc    Get user's activity feed
// @route   GET /api/feed
// @access  Private
exports.getFeed = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const feedItems = [];

    // Get recent connection requests received
    const recentRequests = await Relationship.find({
      followed_user_id: userId,
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    }).populate({
      path: 'follower_user_id',
      model: 'User',
      select: 'username fname lname profilePicture'
    }).sort({ createdAt: -1 }).limit(10);

    recentRequests.forEach(request => {
      feedItems.push({
        id: request.id,
        type: 'request',
        user: {
          username: request.follower_user_id.username,
          profile_pic: request.follower_user_id.profilePicture
        },
        message: `${request.follower_user_id.username} sent you a connection request`,
        timestamp: request.createdAt
      });
    });

    // Get recent matches
    const recentMatches = await Relationship.find({
      $or: [
        { follower_user_id: userId, status: 'matched' },
        { followed_user_id: userId, status: 'matched' }
      ],
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).populate([
      {
        path: 'follower_user_id',
        model: 'User',
        select: 'username fname lname profilePicture'
      },
      {
        path: 'followed_user_id',
        model: 'User',
        select: 'username fname lname profilePicture'
      }
    ]).sort({ updatedAt: -1 }).limit(10);

    recentMatches.forEach(match => {
      const otherUser = match.follower_user_id._id.toString() === userId 
        ? match.followed_user_id 
        : match.follower_user_id;
      
      feedItems.push({
        id: match.id + '_match',
        type: 'match',
        user: {
          username: otherUser.username,
          profile_pic: otherUser.profilePicture
        },
        message: `You matched with ${otherUser.username}`,
        timestamp: match.updatedAt
      });
    });

    // Get recent messages (including video call invitations)
    // Get recent messages
    const recentMessages = await Chat.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ],
      created: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Fetch from the last 7 days
    }).populate([
      {
        path: 'senderId',
        model: 'User',
        select: 'username fname lname profile_pic'
      },
      {
        path: 'receiverId',
        model: 'User',
        select: 'username fname lname profile_pic'
      }
    ]).sort({ created: -1 }).limit(20);

    recentMessages.forEach(message => {
      const isSender = message.senderId._id.toString() === userId;
      const otherUser = isSender ? message.receiverId : message.senderId;
      
      // Since the Chat model doesn't have messageType, we check the content.
      const isVideoCall = message.message && (message.message.includes('video call invitation') || message.message.includes('Video Call Invitation'));
      
      let displayMessage = '';
      if (isVideoCall) {
          displayMessage = isSender 
              ? `You invited ${otherUser.username} to a video call`
              : `${otherUser.username} invited you to a video call`;
      } else {
          displayMessage = isSender 
              ? `You sent a message to ${otherUser.username}`
              : `${otherUser.username} sent you a message`;
      }
      
      feedItems.push({
        id: message._id,
        type: isVideoCall ? 'video_call' : 'message',
        user: {
          username: otherUser.username,
          profile_pic: otherUser.profile_pic
        },
        message: displayMessage,
        timestamp: message.created
      });
    });

    // Get recent profile views (from UserActivityLog)
    const recentViews = await UserActivityLog.find({
      receiverId: userId,
      action: 'PROFILE_VIEW',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).populate({
      path: 'userId',
      model: 'User',
      select: 'username fname lname profilePicture'
    }).sort({ createdAt: -1 }).limit(15);

    recentViews.forEach(view => {
      feedItems.push({
        id: view._id,
        type: 'view',
        user: {
          username: view.userId.username,
          profile_pic: view.userId.profilePicture
        },
        message: `${view.userId.username} viewed your profile`,
        timestamp: view.createdAt
      });
    });

    // Sort all feed items by timestamp (most recent first)
    feedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const totalItems = feedItems.length;
    const paginatedFeed = feedItems.slice(skip, skip + parseInt(limit));
    const hasMore = skip + parseInt(limit) < totalItems;

    res.json({ 
      feed: paginatedFeed,
      pagination: {
        currentPage: parseInt(page),
        totalItems,
        itemsPerPage: parseInt(limit),
        hasMore,
        totalPages: Math.ceil(totalItems / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark feed item as read
// @route   PUT /api/feed/:id/read
// @access  Private
exports.markFeedItemRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    // This would typically update a read status in a feed-specific model
    // For now, we'll just return success
    res.json({ message: 'Feed item marked as read' });
  } catch (error) {
    console.error('Mark feed item read error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
