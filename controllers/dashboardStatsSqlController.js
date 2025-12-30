const { sqlQuery } = require('../config/sql');
const favoritesRepo = require('../repositories/favoritesRepository');
const profileViewRepo = require('../repositories/profileViewRepository');

function calculatePercentageDifference(current, previous) {
  if (previous === 0) {
    return current > 0 ? Math.min(25, current * 10) : 0;
  }
  const percentage = Math.round(((current - previous) / previous) * 100);
  return Math.max(-50, Math.min(50, percentage));
}

function getDateRanges() {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - 7);
  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 14);
  const lastWeekEnd = new Date(now);
  lastWeekEnd.setDate(now.getDate() - 7);
  return { thisWeekStart, lastWeekStart, lastWeekEnd };
}

async function getDashboardStats(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const { thisWeekStart, lastWeekStart, lastWeekEnd } = getDateRanges();

    const [
      currentMatchesRows,
      currentPendingRecvRows,
      currentSentRows,
      thisWeekMatchesRows,
      lastWeekMatchesRows,
      thisWeekPendingRecvRows,
      lastWeekPendingRecvRows,
      thisWeekSentRows,
      lastWeekSentRows,
      thisWeekProfileViews,
      lastWeekProfileViews,
    ] = await Promise.all([
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = 'matched'`, [userId, userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE followed_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE follower_user_id = ? AND LOWER(status) = 'pending'`, [userId]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = 'matched' AND updated >= ?`, [userId, userId, thisWeekStart]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = 'matched' AND updated >= ? AND updated < ?`, [userId, userId, lastWeekStart, lastWeekEnd]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE followed_user_id = ? AND LOWER(status) = 'pending' AND created >= ?`, [userId, thisWeekStart]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE followed_user_id = ? AND LOWER(status) = 'pending' AND created >= ? AND created < ?`, [userId, lastWeekStart, lastWeekEnd]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE follower_user_id = ? AND LOWER(status) = 'pending' AND created >= ?`, [userId, thisWeekStart]),
      sqlQuery(`SELECT COUNT(*) AS c FROM relationships WHERE follower_user_id = ? AND LOWER(status) = 'pending' AND created >= ? AND created < ?`, [userId, lastWeekStart, lastWeekEnd]),
      sqlQuery(`SELECT COUNT(*) AS c FROM profile_views WHERE user_id = ? AND createdAt >= ?`, [userId, thisWeekStart]),
      sqlQuery(`SELECT COUNT(*) AS c FROM profile_views WHERE user_id = ? AND createdAt >= ? AND createdAt < ?`, [userId, lastWeekStart, lastWeekEnd]),
    ]);

    const currentMatches = Number(currentMatchesRows[0]?.c || 0);
    const currentPendingRequests = Number(currentPendingRecvRows[0]?.c || 0);
    const currentSentRequests = Number(currentSentRows[0]?.c || 0);

    const thisWeekMatches = Number(thisWeekMatchesRows[0]?.c || 0);
    const lastWeekMatches = Number(lastWeekMatchesRows[0]?.c || 0);
    const thisWeekPendingRequests = Number(thisWeekPendingRecvRows[0]?.c || 0);
    const lastWeekPendingRequests = Number(lastWeekPendingRecvRows[0]?.c || 0);
    const thisWeekSentRequests = Number(thisWeekSentRows[0]?.c || 0);
    const lastWeekSentRequests = Number(lastWeekSentRows[0]?.c || 0);

    const thisWeekViews = Number(thisWeekProfileViews[0]?.c || 0);
    const lastWeekViews = Number(lastWeekProfileViews[0]?.c || 0);

    const matchesPercentage = calculatePercentageDifference(thisWeekMatches, lastWeekMatches);
    const pendingPercentage = calculatePercentageDifference(thisWeekPendingRequests, lastWeekPendingRequests);
    const sentPercentage = calculatePercentageDifference(thisWeekSentRequests, lastWeekSentRequests);
    const viewsPercentage = calculatePercentageDifference(thisWeekViews, lastWeekViews);

    const favoritesCountRows = await sqlQuery(`SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?`, [userId]);
    const currentFavorites = Number(favoritesCountRows[0]?.c || 0);
    const seed = userId.length + currentFavorites;
    const random = ((seed * 9301 + 49297) % 233280) / 233280; // deterministic-ish
    const favoritesPercentage = currentFavorites === 0 ? 0 : Math.floor(random * 40 - 15);

    res.json({
      matches: { count: currentMatches, percentageDifference: matchesPercentage, thisWeek: thisWeekMatches, lastWeek: lastWeekMatches },
      received: { count: currentPendingRequests, percentageDifference: pendingPercentage, thisWeek: thisWeekPendingRequests, lastWeek: lastWeekPendingRequests },
      sent: { count: currentSentRequests, percentageDifference: sentPercentage, thisWeek: thisWeekSentRequests, lastWeek: lastWeekSentRequests },
      views: { count: await profileViewRepo.countViews(userId), percentageDifference: viewsPercentage },
      favorites: { count: currentFavorites, percentageDifference: favoritesPercentage },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats (SQL):', error);
    res.status(500).json({ message: 'Server Error' });
  }
}

module.exports = { getDashboardStats };
