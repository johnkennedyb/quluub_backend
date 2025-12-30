const { v4: uuidv4 } = require('uuid');
const userRepo = require('../repositories/userRepository');
const relRepo = require('../repositories/relationshipRepository');
const { sendConnectionRequestEmail, sendConnectionRejectedEmail, sendRequestWithdrawnEmail } = require('../utils/emailService');

// Helper: ensure wali details when female
function hasValidWaliDetails(user) {
  if (!user || user.gender !== 'female') return true;
  if (!user.waliDetails) return false;
  try {
    const data = typeof user.waliDetails === 'string' ? JSON.parse(user.waliDetails) : user.waliDetails;
    return !!(data && data.name && data.email);
  } catch {
    return false;
  }
}

// @desc    Send a follow request
// @route   POST /api/relationships/request
// @access  Private
async function sendRequest(req, res) {
  try {
    const { followedUserId } = req.body;
    const followerUserId = (req.user._id || req.user.id).toString();

    if (!followedUserId) return res.status(400).json({ message: 'followedUserId is required' });
    if (followerUserId === followedUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const currentUser = req.user || (await userRepo.findById(followerUserId));
    if (!hasValidWaliDetails(currentUser)) {
      return res.status(400).json({ message: 'Please complete your Wali name and email in your profile settings before sending requests.' });
    }

    const followedUser = await userRepo.findById(followedUserId);
    if (!followedUser) return res.status(404).json({ message: 'User not found' });

    const existing = await relRepo.getByPair(followerUserId, followedUserId);
    if (existing) {
      const msg = existing.status === 'pending' ? 'sent a request to' : existing.status === 'matched' ? 'matched with' : 'been rejected by';
      return res.status(400).json({ message: `You have already ${msg} this user` });
    }

    const relationship = await relRepo.createRequest({ follower_user_id: followerUserId, followed_user_id: followedUserId });

    // Email notify followed user
    try {
      if (followedUser && followedUser.email) {
        const follower = currentUser || (await userRepo.findById(followerUserId));
        await sendConnectionRequestEmail(followedUser.email, followedUser.fname, follower.username);
      }
    } catch {}

    return res.status(201).json(relationship);
  } catch (error) {
    console.error('Send request (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// @desc    Respond to a follow request (accept or reject)
// @route   PUT /api/relationships/:id/status
// @access  Private
async function respondToRequest(req, res) {
  try {
    const { status } = req.body;
    const relationshipId = req.params.id;

    if (!['rejected', 'matched'].includes((status || '').toLowerCase())) {
      return res.status(400).json({ message: "Invalid status. Must be 'rejected' or 'matched'" });
    }

    let relationship = await relRepo.getById(relationshipId);
    if (!relationship) {
      return res.status(404).json({ message: 'Relationship not found' });
    }

    if (relationship.followed_user_id !== (req.user._id || req.user.id).toString()) {
      return res.status(403).json({ message: 'Not authorized to update this relationship' });
    }

    if (relationship.status !== 'pending') {
      return res.status(400).json({ message: `Cannot update relationship that is already ${relationship.status}` });
    }

    relationship = await relRepo.updateStatus(relationship.id, status.toLowerCase());

    if (relationship.status === 'rejected') {
      try {
        const followerUser = await userRepo.findById(relationship.follower_user_id);
        if (followerUser && followerUser.email) {
          await sendConnectionRejectedEmail(followerUser.email, followerUser.fname);
        }
      } catch {}
    }

    return res.json(relationship);
  } catch (error) {
    console.error('Respond to request (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// @desc    Withdraw a follow request
// @route   DELETE /api/relationships/withdraw/:id
// @access  Private
async function withdrawRequest(req, res) {
  try {
    const relationshipId = req.params.id;
    const currentUserId = (req.user._id || req.user.id).toString();

    const relationship = await relRepo.getById(relationshipId);
    if (!relationship) return res.status(404).json({ message: 'Relationship not found' });

    if (relationship.follower_user_id !== currentUserId) {
      return res.status(403).json({ message: 'Not authorized to withdraw this relationship' });
    }

    const otherUserId = relationship.followed_user_id;
    const otherUser = await userRepo.findById(otherUserId);
    const currentUser = await userRepo.findById(currentUserId);

    await relRepo.deleteById(relationshipId);

    try {
      if (otherUser && currentUser) {
        await sendRequestWithdrawnEmail(otherUser.email, otherUser.fname, currentUser.fname || currentUser.username);
      }
    } catch {}

    return res.json({ message: 'Request withdrawn successfully' });
  } catch (error) {
    console.error('Withdraw request (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// @desc    Get all matches for a user
// @route   GET /api/relationships/matches
// @access  Private
async function getMatches(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const userGender = req.user.gender;

    const oppositeGender = userGender === 'male' ? 'female' : userGender === 'female' ? 'male' : 'female';

    const relationships = await relRepo.listMatches(userId);
    const matchedUserIds = relationships.map(rel => (rel.follower_user_id === userId ? rel.followed_user_id : rel.follower_user_id));

    if (!matchedUserIds.length) return res.json({ count: 0, matches: [] });

    const users = await Promise.all(matchedUserIds.map(id => userRepo.findById(id)));
    const filtered = users.filter(u => u && u.gender === oppositeGender);

    const matches = filtered.map(u => {
      const rel = relationships.find(r => r.follower_user_id === u._id || r.followed_user_id === u._id) || null;
      return {
        _id: u._id,
        fname: u.fname,
        lname: u.lname,
        username: u.username,
        gender: u.gender,
        dob: u.dob,
        country: u.country,
        region: u.region,
        summary: u.summary,
        relationship: rel,
        relationshipId: rel ? rel.id : null,
      };
    });

    res.json({ count: matches.length, matches });
  } catch (error) {
    console.error('Get matches (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// @desc    Get pending connection requests for a user (received)
// @route   GET /api/relationships/pending
// @access  Private
async function getPendingRequests(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const relationships = await relRepo.listPendingForFollowed(userId);
    const followerIds = relationships.map(r => r.follower_user_id);
    const users = await Promise.all(followerIds.map(id => userRepo.findById(id)));
    const requests = users.filter(Boolean).map(u => ({
      _id: u._id,
      fname: u.fname,
      lname: u.lname,
      username: u.username,
      profilePicture: u.profilePicture,
      gender: u.gender,
      dob: u.dob,
      country: u.country,
      region: u.region,
      summary: u.summary,
      relationship: relationships.find(r => r.follower_user_id === u._id),
    }));
    res.json({ count: requests.length, requests });
  } catch (error) {
    console.error('Get pending (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// @desc    Get sent connection requests for a user
// @route   GET /api/relationships/sent
// @access  Private
async function getSentRequests(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const sent = await relRepo.listPendingSentByFollower(userId);
    const followedIds = sent.map(r => r.followed_user_id);
    const users = await Promise.all(followedIds.map(id => userRepo.findById(id)));

    const transformed = users.filter(Boolean).map(u => ({
      _id: u._id,
      fname: u.fname,
      lname: u.lname,
      username: u.username,
      profilePicture: u.profilePicture,
      gender: u.gender,
      dob: u.dob,
      country: u.country,
      region: u.region,
      summary: u.summary,
      relationship: (function() {
        const r = sent.find(s => s.followed_user_id === u._id);
        return r ? { id: r.id, _id: r.id, status: r.status, createdAt: r.created, relationshipId: r.id } : null;
      })(),
    }));

    res.json({ requests: transformed });
  } catch (error) {
    console.error('Get sent (SQL) error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = {
  sendRequest,
  respondToRequest,
  withdrawRequest,
  getMatches,
  getPendingRequests,
  getSentRequests,
};
