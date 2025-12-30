const { sqlQuery } = require('../config/sql');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS profile_views (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      viewer_id VARCHAR(64) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_viewer (viewer_id),
      INDEX idx_user_time (user_id, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function hasRecentView(viewerId, userId, since) {
  await ensureTable();
  const rows = await sqlQuery(
    'SELECT id FROM profile_views WHERE viewer_id = ? AND user_id = ? AND createdAt >= ? LIMIT 1',
    [viewerId, userId, since]
  );
  return rows.length > 0;
}

async function logView(viewerId, userId) {
  await ensureTable();
  await sqlQuery(
    'INSERT INTO profile_views (viewer_id, user_id) VALUES (?, ?)',
    [viewerId, userId]
  );
}

async function countViews(userId) {
  await ensureTable();
  const rows = await sqlQuery('SELECT COUNT(*) as cnt FROM profile_views WHERE user_id = ?', [userId]);
  return rows[0] ? Number(rows[0].cnt) : 0;
}

async function listRecentViewsForUser(userId, since, limit = 15) {
  await ensureTable();
  const rows = await sqlQuery(
    'SELECT * FROM profile_views WHERE user_id = ? AND createdAt >= ? ORDER BY createdAt DESC LIMIT ?',
    [userId, since, Number(limit) || 15]
  );
  return rows;
}

module.exports = {
  hasRecentView,
  logView,
  countViews,
  listRecentViewsForUser,
};
