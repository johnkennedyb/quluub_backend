const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      userId VARCHAR(64) NOT NULL,
      title VARCHAR(255) NULL,
      message TEXT,
      type VARCHAR(64) NOT NULL,
      data JSON NULL,
      isRead TINYINT(1) DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_userId (userId),
      INDEX idx_created (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    user: row.userId,
    userId: row.userId,
    title: row.title || null,
    message: row.message || '',
    type: row.type || 'general',
    data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null,
    read: row.isRead === 1 || row.isRead === true,
    createdAt: row.createdAt,
  };
}

async function listByUser(userId, limit = 100) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?', [userId, Number(limit) || 100]);
  return rows.map(mapRow);
}

async function createNotification({ userId, title, message, type = 'general', data }) {
  await ensureTable();
  const id = uuidv4();
  const payload = typeof data === 'object' && data !== null ? JSON.stringify(data) : data || null;
  await sqlQuery(
    'INSERT INTO notifications (id, userId, title, message, type, data) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, title || null, message || '', type, payload]
  );
  const rows = await sqlQuery('SELECT * FROM notifications WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function markAsRead(id, userId) {
  await ensureTable();
  const res = await sqlQuery('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [id, userId]);
  return res.affectedRows > 0;
}

async function deleteById(id, userId) {
  await ensureTable();
  const res = await sqlQuery('DELETE FROM notifications WHERE id = ? AND userId = ?', [id, userId]);
  return res.affectedRows > 0;
}

module.exports = {
  listByUser,
  createNotification,
  markAsRead,
  deleteById,
  listByUserAndTypeSince: async (userId, type, minutes = 5) => {
    await ensureTable();
    const rows = await sqlQuery(
      `SELECT * FROM notifications 
       WHERE userId = ? AND type = ? AND createdAt >= (NOW() - INTERVAL ? MINUTE)
       ORDER BY createdAt DESC`,
      [userId, type, Number(minutes) || 5]
    );
    return rows.map(mapRow);
  },
  deleteByTypeAndSession: async (userId, type, sessionId) => {
    await ensureTable();
    // Use JSON_EXTRACT to filter by data.sessionId
    const res = await sqlQuery(
      `DELETE FROM notifications WHERE userId = ? AND type = ? AND JSON_EXTRACT(data, '$.sessionId') = ?`,
      [userId, type, sessionId]
    );
    return res.affectedRows || 0;
  },
};
