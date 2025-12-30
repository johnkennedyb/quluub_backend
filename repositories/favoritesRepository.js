const { sqlQuery } = require('../config/sql');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id VARCHAR(64) NOT NULL,
      favorite_user_id VARCHAR(64) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, favorite_user_id),
      INDEX idx_fav_user (user_id),
      INDEX idx_fav_target (favorite_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function add(userId, favoriteUserId) {
  await ensureTable();
  await sqlQuery(
    'INSERT IGNORE INTO favorites (user_id, favorite_user_id) VALUES (?, ?)',
    [userId, favoriteUserId]
  );
  return { user_id: userId, favorite_user_id: favoriteUserId };
}

async function remove(userId, favoriteUserId) {
  await ensureTable();
  await sqlQuery('DELETE FROM favorites WHERE user_id = ? AND favorite_user_id = ?', [userId, favoriteUserId]);
  return true;
}

async function list(userId) {
  await ensureTable();
  const rows = await sqlQuery('SELECT favorite_user_id FROM favorites WHERE user_id = ? ORDER BY createdAt DESC', [userId]);
  return rows.map(r => r.favorite_user_id);
}

module.exports = {
  add,
  remove,
  list,
};
