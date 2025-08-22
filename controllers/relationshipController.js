
const { v4: uuidv4 } = require('uuid');
const Relationship = require('../models/Relationship');
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog');
const { sendConnectionRequestEmail, sendConnectionRejectedEmail, sendRequestWithdrawnEmail } = require('../utils/emailService');

// @desc    Send a follow request
// @route   POST /api/relationships/request
// @access  Private
exports.sendRequest = async (req, res) => {
  try {
    const { followedUserId } = req.body;
    const followerUserId = req.user._id.toString();
    
    console.log(`Sending request: follower=${followerUserId}, followed=${followedUserId}`);
    
    // Check if user is trying to follow themselves
    if (followerUserId === followedUserId) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }
    
    // Check if followed user exists
    const followedUser = await User.findById(followedUserId);
    if (!followedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if relationship already exists
    const existingRelationship = await Relationship.findOne({
      follower_user_id: followerUserId,
      followed_user_id: followedUserId,
    });
    
    if (existingRelationship) {
      return res.status(400).json({ 
        message: `You have already ${existingRelationship.status === 'pending' ? 'sent a request to' : existingRelationship.status === 'matched' ? 'matched with' : 'been rejected by'} this user` 
      });
    }
    
    // Create relationship
    const relationship = new Relationship({
      id: uuidv4(),
      follower_user_id: followerUserId,
      followed_user_id: followedUserId,
      status: "pending",
    });
    
    await relationship.save();
    console.log("Relationship created:", relationship);
    
    // Log the activity
    await UserActivityLog.create({
      userId: followerUserId,
      receiverId: followedUserId,
      action: "FOLLOWED",
    });

    // Send email notification to the followed user
    const followerUser = await User.findById(followerUserId);
    if (followedUser && followedUser.email) {
      sendConnectionRequestEmail(followedUser.email, followedUser.fname, followerUser.username);
    }
    
    res.status(201).json(relationship);
  } catch (error) {
    console.error("Send request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Respond to a follow request (accept or reject)
// @route   PUT /api/relationships/:id/status
// @access  Private
exports.respondToRequest = async (req, res) => {
  try {
    const { status } = req.body;
    const relationshipId = req.params.id;
    
    console.log(`Responding to request: relationship=${relationshipId}, status=${status}`);
    
    if (!['rejected', 'matched'].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'rejected' or 'matched'" });
    }
    
    // Find relationship - try both custom id field and MongoDB _id
    let relationship = await Relationship.findOne({ id: relationshipId });
    
    // If not found by custom id, try MongoDB _id
    if (!relationship) {
      relationship = await Relationship.findById(relationshipId);
    }
    
    if (!relationship) {
      console.log(`Relationship not found with id: ${relationshipId}`);
      return res.status(404).json({ message: "Relationship not found" });
    }
    
    console.log(`Found relationship:`, { id: relationship.id, _id: relationship._id, status: relationship.status });
    
    // Check if user is the one being followed (only they can respond)
    if (relationship.followed_user_id !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this relationship" });
    }
    
    // Check if relationship is in pending state
    if (relationship.status !== 'pending') {
      return res.status(400).json({ message: `Cannot update relationship that is already ${relationship.status}` });
    }
    
    // Update status
    relationship.status = status;
    await relationship.save();
    console.log("Relationship updated:", relationship);
    
    // Log the activity
    await UserActivityLog.create({
      userId: req.user._id.toString(),
      receiverId: relationship.follower_user_id,
      action: status === 'matched' ? "FOLLOWED" : "REJECTED",
    });

    // If rejected, send an email notification to the user who sent the request
    if (status === 'rejected') {
      const followerUser = await User.findById(relationship.follower_user_id);
      if (followerUser && followerUser.email) {
        sendConnectionRejectedEmail(followerUser.email, followerUser.fname);
      }
    }
    
    res.json(relationship);
  } catch (error) {
    console.error("Respond to request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Withdraw a follow request
// @route   DELETE /api/relationships/withdraw/:id
// @access  Private
exports.withdrawRequest = async (req, res) => {
  try {
    const relationshipId = req.params.id;
    
    console.log(`Withdrawing request: relationship=${relationshipId}`);
    
    // Find relationship using raw MongoDB query to avoid Mongoose casting
    const relationship = await Relationship.collection.findOne({ id: relationshipId });
    
    console.log(`Relationship found:`, relationship ? 'Yes' : 'No');
    if (relationship) {
      console.log(`Relationship details: follower=${relationship.follower_user_id}, followed=${relationship.followed_user_id}, status=${relationship.status}`);
    }
    
    if (!relationship) {
      return res.status(404).json({ message: "Relationship not found" });
    }
    
    // Check if user is the follower (only they can withdraw)
    const currentUserId = req.user._id.toString();
    console.log(`Checking authorization: follower=${relationship.follower_user_id}, current=${currentUserId}`);
    
    if (relationship.follower_user_id !== currentUserId) {
      return res.status(403).json({ message: "Not authorized to withdraw this relationship" });
    }
    
    // Check if relationship is in pending state
    if (relationship.status !== 'pending') {
      return res.status(400).json({ message: `Cannot withdraw relationship that is already ${relationship.status}` });
    }
    
    // Delete relationship using raw MongoDB query to avoid Mongoose casting
    await Relationship.collection.deleteOne({ id: relationshipId });
    console.log("Relationship deleted");
    
    // Log the activity
    await UserActivityLog.create({
      userId: req.user._id.toString(),
      receiverId: relationship.followed_user_id,
      action: "WITHDREW",
    });

    // Send email notification to the user who received the request
    const followedUser = await User.findById(relationship.followed_user_id);
    const withdrawer = await User.findById(req.user._id);
    if (followedUser && followedUser.email && withdrawer) {
      sendRequestWithdrawnEmail(followedUser.email, followedUser.fname, withdrawer.username);
    }
    
    res.json({ message: "Request withdrawn successfully" });
  } catch (error) {
    console.error("Withdraw request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all matches for a user
// @route   GET /api/relationships/matches
// @access  Private
exports.getMatches = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userGender = req.user.gender;

    // Determine the gender to show in matches (for matrimonial apps, opposite gender only)
    const oppositeGender = userGender === 'male' ? 'female' : 'male';

    // Find all matched relationships where user is follower or followed
    const relationships = await Relationship.find({
      $or: [
        { follower_user_id: userId },
        { followed_user_id: userId },
      ],
      status: 'matched',
    });

    // Get array of matched user IDs
    const matchedUserIds = relationships.map((rel) => {
      return rel.follower_user_id === userId
        ? rel.followed_user_id
        : rel.follower_user_id;
    });

    if (matchedUserIds.length === 0) {
      return res.json({ count: 0, matches: [] });
    }

    // Get user details for matches, filtered by opposite gender (matrimonial requirement)
    const matches = await User.find({
      _id: { $in: matchedUserIds },
      gender: oppositeGender, // Only show opposite gender for matrimonial purposes
    }).select('fname lname username profilePicture gender dob country region summary');

    res.json({
      count: matches.length,
      matches: matches.map((match) => {
        const relationship = relationships.find(
          (rel) =>
            (rel.follower_user_id === match._id.toString() ||
              rel.followed_user_id === match._id.toString()) &&
            (rel.follower_user_id === userId || rel.followed_user_id === userId)
        );
        
        return {
          ...match._doc,
          relationship: relationship,
          relationshipId: relationship ? relationship.id : null // Use custom id for frontend
        };
      }),
    });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get pending connection requests for a user
// @route   GET /api/relationships/pending
// @access  Private
exports.getPendingRequests = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    
    console.log(`Getting pending requests for user: ${userId}`);
    
    // Find all pending relationships where user is being followed
    const relationships = await Relationship.find({
      followed_user_id: userId,
      status: 'pending'
    });
    
    console.log(`Found ${relationships.length} pending relationship requests`);
    
    // Get array of follower user IDs
    const followerUserIds = relationships.map(rel => rel.follower_user_id);
    
    // Get user details for followers
    const requestUsers = await User.find({
      _id: { $in: followerUserIds }
    }).select('fname lname username profilePicture gender dob country region summary');
    
    console.log(`Found ${requestUsers.length} requesting users`);
    
    res.json({
      count: requestUsers.length,
      requests: requestUsers.map(user => ({
        ...user._doc,
        relationship: relationships.find(rel => rel.follower_user_id === user._id.toString())
      }))
    });
  } catch (error) {
    console.error("Get pending requests error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get sent connection requests for a user
// @route   GET /api/relationships/sent
// @access  Private
exports.getSentRequests = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    
    console.log(`Getting sent requests for user: ${userId}`);
    
    // Find all relationships where current user is the follower (sender)
    const sentRequests = await Relationship.find({
      follower_user_id: userId,
      status: 'pending'
    }).populate({
      path: 'followed_user_id',
      model: 'User',
      select: 'fname lname username profilePicture gender dob country region summary'
    });
    
    console.log(`Found ${sentRequests.length} sent requests`);
    
    // Transform the data to match expected format - return user objects directly
    // Filter out requests where the followed user no longer exists (deleted accounts)
    const transformedRequests = sentRequests
      .filter(request => request.followed_user_id !== null)
      .map(request => ({
        ...request.followed_user_id._doc, // Spread the user data directly
        relationship: {
          id: request.id,
          _id: request._id,
          status: request.status,
          createdAt: request.createdAt,
          relationshipId: request.id
        }
      }));
    
    res.json({ requests: transformedRequests });
  } catch (error) {
    console.error("Get sent requests error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Withdraw a connection request or relationship
// @route   DELETE /api/relationships/withdraw/:id
// @access  Private
exports.withdrawRequest = async (req, res) => {
  try {
    const relationshipId = req.params.id;
    const userId = req.user._id.toString();
    
    console.log(`Withdrawing relationship: ${relationshipId} by user: ${userId}`);
    
    // Only find by custom id field, never by _id
    const relationship = await Relationship.findOne({ id: relationshipId });
    
    if (!relationship) {
      console.log(`Relationship not found with id: ${relationshipId}`);
      return res.status(404).json({ message: 'Relationship not found' });
    }
    
    // Check if user is part of this relationship
    if (relationship.follower_user_id !== userId && relationship.followed_user_id !== userId) {
      return res.status(403).json({ message: 'Not authorized to withdraw this relationship' });
    }
    
    // Get the other user for notification
    const otherUserId = relationship.follower_user_id === userId 
      ? relationship.followed_user_id 
      : relationship.follower_user_id;
    
    const otherUser = await User.findById(otherUserId);
    const currentUser = await User.findById(userId);
    
    // Delete the relationship using its MongoDB _id
    await Relationship.findByIdAndDelete(relationship._id);
    
    // Log the activity
    try {
      await UserActivityLog.create({
        userId: userId,
        action: 'CONNECTION_WITHDRAWN',
        receiverId: otherUserId,
        metadata: {
          relationshipId: relationship._id,
          previousStatus: relationship.status
        }
      });
    } catch (logError) {
      console.error('Failed to log withdraw activity:', logError);
    }
    
    // Send email notification if other user exists
    if (otherUser && currentUser) {
      try {
        await sendRequestWithdrawnEmail(otherUser, currentUser);
      } catch (emailError) {
        console.error('Failed to send withdrawal email:', emailError);
      }
    }
    
    console.log(`Relationship withdrawn successfully: ${relationshipId}`);
    
    res.json({ 
      message: 'Connection withdrawn successfully',
      relationshipId: relationship._id
    });
    
  } catch (error) {
    console.error('Withdraw request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
