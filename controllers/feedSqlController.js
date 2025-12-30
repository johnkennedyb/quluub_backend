const { sqlQuery } = require('../config/sql');
const userRepo = require('../repositories/userRepository');
const relRepo = require('../repositories/relationshipRepository');
const chatRepo = require('../repositories/chatRepository');
const profileViewRepo = require('../repositories/profileViewRepository');

// @desc    Get user's activity feed (SQL)
// @route   GET /api/feed
// @access  Private
async function getFeed(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const feedItems = [];

    // Recent connection requests received (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pendingRows = await sqlQuery(
      `SELECT r.*, u.username, u.fname, u.lname
       FROM relationships r
       JOIN users u ON u.id = r.follower_user_id
       WHERE r.followed_user_id = ? AND LOWER(r.status) = 'pending' AND r.created >= ?
       ORDER BY r.created DESC
       LIMIT 10`,
      [userId, sevenDaysAgo]
    );
    for (const row of pendingRows) {
      feedItems.push({
        id: row.id,
        type: 'request',
        user: { username: row.username, profile_pic: null },
        message: `${row.username} sent you a connection request`,
        timestamp: row.created,
      });
    }

    // Recent matches (last 7 days)
    const matchRows = await sqlQuery(
      `SELECT r.*, fu.username AS f_username,
              tu.username AS t_username
       FROM relationships r
       JOIN users fu ON fu.id = r.follower_user_id
       JOIN users tu ON tu.id = r.followed_user_id
       WHERE (r.follower_user_id = ? OR r.followed_user_id = ?) AND LOWER(r.status) = 'matched' AND r.updated >= ?
       ORDER BY r.updated DESC LIMIT 10`,
      [userId, userId, sevenDaysAgo]
    );
    for (const row of matchRows) {
      const isFollower = row.follower_user_id === userId;
      const otherUsername = isFollower ? row.t_username : row.f_username;
      feedItems.push({
        id: `${row.id}_match`,
        type: 'match',
        user: { username: otherUsername, profile_pic: null },
        message: `You matched with ${otherUsername}`,
        timestamp: row.updated,
      });
    }

    // Recent messages (last 7 days)
    const msgRows = await sqlQuery(
      `SELECT c.*, su.username AS s_username, ru.username AS r_username, su.fname AS s_fname, su.lname AS s_lname, ru.fname AS r_fname, ru.lname AS r_lname
       FROM chat c
       JOIN users su ON su.id = c.senderId
       JOIN users ru ON ru.id = c.receiverId
       WHERE (c.senderId = ? OR c.receiverId = ?) AND c.created >= ?
       ORDER BY c.created DESC LIMIT 20`,
      [userId, userId, sevenDaysAgo]
    );
    for (const m of msgRows) {
      const isSender = m.senderId === userId;
      const otherUsername = isSender ? m.r_username : m.s_username;
      const isVideoCall = m.message && (m.message.includes('video call invitation') || m.message.includes('Video Call Invitation'));
      const displayMessage = isVideoCall
        ? (isSender ? `You invited ${otherUsername} to a video call` : `${otherUsername} invited you to a video call`)
        : (isSender ? `You sent a message to ${otherUsername}` : `${otherUsername} sent you a message`);
      feedItems.push({
        id: m.id,
        type: isVideoCall ? 'video_call' : 'message',
        user: { username: otherUsername, profile_pic: null },
        message: displayMessage,
        timestamp: m.created,
        targetUserId: isSender ? m.receiverId : m.senderId,
        conversation: isSender ? m.receiverId : m.senderId,
      });
    }

    // Recent profile views
    const recentViews = await profileViewRepo.listRecentViewsForUser(userId, sevenDaysAgo, 15);
    for (const v of recentViews) {
      const viewer = await userRepo.findById(v.viewer_id || v.viewerId || v.viewerid);
      if (viewer) {
        feedItems.push({
          id: v.id || `${viewer._id}_${v.createdAt}`,
          type: 'view',
          user: { username: viewer.username, profile_pic: null },
          message: `${viewer.username} viewed your profile`,
          timestamp: v.createdAt,
        });
      }
    }

    // Sort, paginate
    feedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const totalItems = feedItems.length;
    const paginatedFeed = feedItems.slice(skip, skip + limit);
    const hasMore = skip + limit < totalItems;

    res.json({
      feed: paginatedFeed,
      pagination: {
        currentPage: page,
        totalItems,
        itemsPerPage: limit,
        hasMore,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (e) {
    console.error('Get feed (SQL) error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// @desc    Mark feed item as read (no-op placeholder)
async function markFeedItemRead(req, res) {
  try {
    res.json({ message: 'Feed item marked as read' });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getFeed, markFeedItemRead };
