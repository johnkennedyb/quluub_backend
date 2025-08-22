const User = require('../models/User');
const Relationship = require('../models/Relationship');
const UserActivityLog = require('../models/UserActivityLog');

// @desc    Get user profile with relationship status (optimized)
// @route   GET /api/users/profile-optimized/:userId
// @access  Private
const getProfileWithRelationships = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id.toString();
    
    console.log(`Getting optimized profile for ${targetUserId} by ${currentUserId}`);
    
    // Get target user profile
    const targetUser = await User.findById(targetUserId)
      .select('-password -resetPasswordToken -resetPasswordTokenExpiration -validationToken -email -phoneNumber -parentEmail -waliDetails -favorites -blockedUsers -reportedUsers');
    
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Initialize relationship status
    let relationshipStatus = {
      isMatched: false,
      hasReceivedRequestFrom: false,
      hasSentRequestTo: false,
      relationshipId: null,
      requestId: null,
      isFavorited: false
    };
    
    // Only check relationships if viewing another user's profile
    if (currentUserId !== targetUserId) {
      // Check for existing relationship in both directions with single query
      const relationships = await Relationship.find({
        $or: [
          { follower_user_id: currentUserId, followed_user_id: targetUserId },
          { follower_user_id: targetUserId, followed_user_id: currentUserId }
        ]
      });
      
      for (const rel of relationships) {
        if (rel.status === 'matched') {
          relationshipStatus.isMatched = true;
          relationshipStatus.relationshipId = rel.id;
          break;
        } else if (rel.status === 'pending') {
          if (rel.follower_user_id === targetUserId && rel.followed_user_id === currentUserId) {
            relationshipStatus.hasReceivedRequestFrom = true;
            relationshipStatus.requestId = rel.id;
          } else if (rel.follower_user_id === currentUserId && rel.followed_user_id === targetUserId) {
            relationshipStatus.hasSentRequestTo = true;
            relationshipStatus.relationshipId = rel.id;
          }
        }
      }
      
      // Check if user is in favorites with single query
      const currentUser = await User.findById(currentUserId).select('favorites');
      relationshipStatus.isFavorited = currentUser?.favorites?.includes(targetUserId) || false;
    }
    
    // Log profile view asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        await UserActivityLog.create({
          user: currentUserId,
          action: 'PROFILE_VIEW',
          targetUser: targetUserId,
          details: `Viewed profile of ${targetUser.fname} ${targetUser.lname}`
        });
      } catch (logError) {
        console.error('Failed to log profile view:', logError);
      }
    });
    
    res.json({
      user: targetUser,
      relationshipStatus
    });
    
  } catch (error) {
    console.error('Get optimized profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getProfileWithRelationships
};
