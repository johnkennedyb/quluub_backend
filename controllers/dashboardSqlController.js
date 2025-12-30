const { sqlQuery } = require('../config/sql');
const userRepo = require('../repositories/userRepository');
const favoritesRepo = require('../repositories/favoritesRepository');
const profileViewRepo = require('../repositories/profileViewRepository');

async function generateActivityFeed(userId) {
  try {
    const feedItems = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Recent messages
    const msgRows = await sqlQuery(
      `SELECT c.*, su.username AS s_username, ru.username AS r_username, su.fname AS s_fname, su.lname AS s_lname, ru.fname AS r_fname, ru.lname AS r_lname
       FROM chat c
       JOIN users su ON su.id = c.senderId
       JOIN users ru ON ru.id = c.receiverId
       WHERE (c.senderId = ? OR c.receiverId = ?) AND c.created >= ?
       ORDER BY c.created DESC LIMIT 50`,
      [userId, userId, sevenDaysAgo]
    );

    for (const m of msgRows) {
      const isReceived = m.receiverId === userId;
      const otherUser = isReceived ? { username: m.s_username, name: `${m.s_fname || ''} ${m.s_lname || ''}`.trim() } : { username: m.r_username, name: `${m.r_fname || ''} ${m.r_lname || ''}`.trim() };
      const isVideoCall = (m.message || '').includes('video call invitation') || (m.message || '').includes('Video Call Invitation');
      const message = isVideoCall
        ? (isReceived ? `${otherUser.name} invited you to a video call` : `You invited ${otherUser.name} to a video call`)
        : (isReceived ? `${otherUser.name} sent you a message` : `You sent a message to ${otherUser.name}`);
      feedItems.push({
        id: m.id,
        type: isVideoCall ? 'video_call' : 'message',
        user: { username: otherUser.username, profile_pic: null },
        message,
        timestamp: m.created,
        targetUserId: isReceived ? m.senderId : m.receiverId,
        conversation: isReceived ? m.senderId : m.receiverId,
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

    return feedItems
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
  } catch (e) {
    console.error('Error generating activity feed (SQL):', e);
    return [];
  }
}

// GET /api/dashboard/combined
async function getCombinedDashboardData(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();

    // Matches
    const matches = await sqlQuery(
      `SELECT r.*, fu.id AS f_id, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname, fu.email AS f_email, fu.gender AS f_gender,
              tu.id AS t_id, tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname, tu.email AS t_email, tu.gender AS t_gender
       FROM relationships r
       JOIN users fu ON fu.id = r.follower_user_id
       JOIN users tu ON tu.id = r.followed_user_id
       WHERE (r.follower_user_id = ? OR r.followed_user_id = ?) AND LOWER(r.status) = 'matched'
       ORDER BY r.updated DESC`,
      [userId, userId]
    );

    const matchesOut = matches.map(r => ({
      _id: r.id,
      id: r.id,
      status: r.status,
      createdAt: r.created,
      updatedAt: r.updated,
      follower_user_id: { _id: r.f_id, username: r.f_username, fname: r.f_fname, lname: r.f_lname, email: r.f_email, gender: r.f_gender },
      followed_user_id: { _id: r.t_id, username: r.t_username, fname: r.t_fname, lname: r.t_lname, email: r.t_email, gender: r.t_gender },
    }));

    // Pending received
    const pendRecv = await sqlQuery(
      `SELECT r.*, fu.id AS f_id, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname, fu.email AS f_email, fu.gender AS f_gender
       FROM relationships r
       JOIN users fu ON fu.id = r.follower_user_id
       WHERE r.followed_user_id = ? AND LOWER(r.status) = 'pending'
       ORDER BY r.created DESC`,
      [userId]
    );
    const pendingRequests = pendRecv.map(r => ({
      _id: r.id,
      id: r.id,
      status: r.status,
      createdAt: r.created,
      follower_user_id: { _id: r.f_id, username: r.f_username, fname: r.f_fname, lname: r.f_lname, email: r.f_email, gender: r.f_gender },
    }));

    // Pending sent
    const pendSent = await sqlQuery(
      `SELECT r.*, tu.id AS t_id, tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname, tu.email AS t_email, tu.gender AS t_gender
       FROM relationships r
       JOIN users tu ON tu.id = r.followed_user_id
       WHERE r.follower_user_id = ? AND LOWER(r.status) = 'pending'
       ORDER BY r.created DESC`,
      [userId]
    );
    const sentRequests = pendSent.map(r => ({
      _id: r.id,
      id: r.id,
      status: r.status,
      createdAt: r.created,
      followed_user_id: { _id: r.t_id, username: r.t_username, fname: r.t_fname, lname: r.t_lname, email: r.t_email, gender: r.t_gender },
    }));

    // Profile views count
    const profileViewsCount = await profileViewRepo.countViews(userId);

    // Favorites
    const favoriteIds = await favoritesRepo.list(userId);
    const favorites = [];
    for (const fid of favoriteIds) {
      const u = await userRepo.findById(fid);
      if (u) favorites.push(u);
    }

    const feedItems = await generateActivityFeed(userId);

    res.json({
      matches: matchesOut,
      pendingRequests,
      sentRequests,
      profileViewsCount,
      favorites,
      feedItems,
    });
  } catch (error) {
    console.error('Error fetching combined dashboard data (SQL):', error);
    res.status(500).json({ message: 'Server Error' });
  }
}

// POST /api/dashboard/ping
async function pingDatabase(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const now = new Date();

    const user = await userRepo.updateById(userId, { lastSeen: now });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [matchesCountRow, pendingRecvRow, pendingSentRow, totalMatchesRows, totalPendingRecvRows, totalSentRows] = await Promise.all([
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = 'matched'`, [userId, userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE followed_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE follower_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT r.*, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname, tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname
                FROM relationships r
                JOIN users fu ON fu.id = r.follower_user_id
                JOIN users tu ON tu.id = r.followed_user_id
                WHERE (r.follower_user_id = ? OR r.followed_user_id = ?) AND LOWER(r.status) = 'matched' ORDER BY r.updated DESC`, [userId, userId]),
      sqlQuery(`SELECT r.*, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname
                FROM relationships r JOIN users fu ON fu.id = r.follower_user_id
                WHERE r.followed_user_id = ? AND LOWER(r.status) = 'pending' ORDER BY r.created DESC`, [userId]),
      sqlQuery(`SELECT r.*, tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname
                FROM relationships r JOIN users tu ON tu.id = r.followed_user_id
                WHERE r.follower_user_id = ? AND LOWER(r.status) = 'pending' ORDER BY r.created DESC`, [userId])
    ]);

    const matchesCount = Number(matchesCountRow[0]?.c || 0);
    const pendingRequestsCount = Number(pendingRecvRow[0]?.c || 0);
    const sentRequestsCount = Number(pendingSentRow[0]?.c || 0);

    const totalMatches = totalMatchesRows.map(r => ({
      _id: r.id, status: r.status, updatedAt: r.updated,
      follower_user_id: { username: r.f_username, fname: r.f_fname, lname: r.f_lname },
      followed_user_id: { username: r.t_username, fname: r.t_fname, lname: r.t_lname },
    }));
    const totalPendingReceived = totalPendingRecvRows.map(r => ({ _id: r.id, status: r.status, createdAt: r.created, follower_user_id: { username: r.f_username, fname: r.f_fname, lname: r.f_lname } }));
    const totalSentRequests = totalSentRows.map(r => ({ _id: r.id, status: r.status, createdAt: r.created, followed_user_id: { username: r.t_username, fname: r.t_fname, lname: r.t_lname } }));

    const profileViews = await profileViewRepo.countViews(userId);
    const freshUser = await userRepo.findById(userId);

    res.json({
      success: true,
      message: 'Hard database ping successful - all data refreshed',
      timestamp: now,
      user: { ...freshUser, lastPing: now },
      stats: { matchesCount, pendingRequestsCount, sentRequestsCount, profileViews },
      relationships: { matches: totalMatches, pendingRequests: totalPendingReceived, sentRequests: totalSentRequests },
      dataRefreshed: true,
      pingType: 'HARD_PING'
    });
  } catch (error) {
    console.error('❌ Error in hard database ping (SQL):', error);
    res.status(500).json({ message: 'Server Error during hard ping', error: error.message, timestamp: new Date() });
  }
}

// GET /api/dashboard/user-settings
async function getUserSettings(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();

    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [matchesCountRow, pendingRecvRow, sentRow, allMatchesRows, allPendingRecvRows, allSentRows, userProfileAgain] = await Promise.all([
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = 'matched'`, [userId, userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE followed_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE follower_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT r.*, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname, fu.email AS f_email, fu.gender AS f_gender,
                        tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname, tu.email AS t_email, tu.gender AS t_gender
                FROM relationships r JOIN users fu ON fu.id = r.follower_user_id JOIN users tu ON tu.id = r.followed_user_id
                WHERE (r.follower_user_id = ? OR r.followed_user_id = ?) AND LOWER(r.status) = 'matched'`, [userId, userId]),
      sqlQuery(`SELECT r.*, fu.username AS f_username, fu.fname AS f_fname, fu.lname AS f_lname, fu.email AS f_email, fu.gender AS f_gender
                FROM relationships r JOIN users fu ON fu.id = r.follower_user_id
                WHERE r.followed_user_id = ? AND LOWER(r.status) = 'pending'`, [userId]),
      sqlQuery(`SELECT r.*, tu.username AS t_username, tu.fname AS t_fname, tu.lname AS t_lname, tu.email AS t_email, tu.gender AS t_gender
                FROM relationships r JOIN users tu ON tu.id = r.followed_user_id
                WHERE r.follower_user_id = ? AND LOWER(r.status) = 'pending'`, [userId]),
      userRepo.findById(userId)
    ]);

    const matchesCount = Number(matchesCountRow[0]?.c || 0);
    const pendingRequestsCount = Number(pendingRecvRow[0]?.c || 0);
    const sentRequestsCount = Number(sentRow[0]?.c || 0);
    const profileViews = await profileViewRepo.countViews(userId);

    const allMatches = allMatchesRows.map(r => ({ _id: r.id, status: r.status, follower_user_id: { username: r.f_username, fname: r.f_fname, lname: r.f_lname, email: r.f_email, gender: r.f_gender }, followed_user_id: { username: r.t_username, fname: r.t_fname, lname: r.t_lname, email: r.t_email, gender: r.t_gender } }));
    const allPendingRequests = allPendingRecvRows.map(r => ({ _id: r.id, status: r.status, follower_user_id: { username: r.f_username, fname: r.f_fname, lname: r.f_lname, email: r.f_email, gender: r.f_gender } }));
    const allSentRequests = allSentRows.map(r => ({ _id: r.id, status: r.status, followed_user_id: { username: r.t_username, fname: r.t_fname, lname: r.t_lname, email: r.t_email, gender: r.t_gender } }));

    const favoriteIds = await favoritesRepo.list(userId);
    const favorites = [];
    for (const fid of favoriteIds) {
      const u = await userRepo.findById(fid);
      if (u) favorites.push(u);
    }

    res.json({
      user: { ...userProfileAgain, lastSeen: userProfileAgain.lastSeen || new Date(), lastPing: new Date() },
      stats: { matchesCount, pendingRequestsCount, sentRequestsCount, profileViews, favoritesCount: favorites.length },
      relationships: { matches: allMatches, pendingRequests: allPendingRequests, sentRequests: allSentRequests },
      lastUpdated: new Date(),
      refreshType: 'HARD_SETTINGS_REFRESH'
    });
  } catch (error) {
    console.error('❌ Error in hard user settings refresh (SQL):', error);
    res.status(500).json({ message: 'Server Error during hard settings refresh', error: error.message, timestamp: new Date() });
  }
}

module.exports = { getCombinedDashboardData, pingDatabase, getUserSettings };
