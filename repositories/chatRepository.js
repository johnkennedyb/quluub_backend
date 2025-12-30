const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

function mapRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    message: row.message,
    status: row.status || null,
    created: row.created,
    createdAt: row.created,
    updated: row.updated,
  };
}

async function addMessage(senderId, receiverId, message, status = 'UNREAD') {
  const id = uuidv4();
  await sqlQuery(
    'INSERT INTO chat (id, senderId, receiverId, message, status) VALUES (?,?,?,?,?)',
    [id, senderId, receiverId, message, status]
  );
  const rows = await sqlQuery('SELECT * FROM chat WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function getBetweenUsers(userA, userB, { limit = 50, offset = 0, sort = 'DESC' } = {}) {
  const order = sort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const rows = await sqlQuery(
    `SELECT * FROM chat 
     WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
     ORDER BY created ${order}
     LIMIT ? OFFSET ?`,
    [userA, userB, userB, userA, limit, offset]
  );
  return rows.map(mapRow);
}

async function getAllForUser(userId, { direction = 'received', sort = 'ASC' } = {}) {
  const order = sort.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const where = direction === 'sent' ? 'senderId = ?' : 'receiverId = ?';
  const rows = await sqlQuery(
    `SELECT * FROM chat WHERE ${where} ORDER BY created ${order}`,
    [userId]
  );
  return rows.map(mapRow);
}

async function countBetween(userA, userB) {
  const rows = await sqlQuery(
    `SELECT COUNT(*) AS c FROM chat 
     WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)`,
    [userA, userB, userB, userA]
  );
  return rows[0]?.c || 0;
}

async function countSentFromTo(senderId, receiverId) {
  const rows = await sqlQuery(
    `SELECT COUNT(*) AS c FROM chat WHERE senderId = ? AND receiverId = ?`,
    [senderId, receiverId]
  );
  return rows[0]?.c || 0;
}

async function markReadByIds(ids) {
  if (!ids || !ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await sqlQuery(
    `UPDATE chat SET status = 'READ' WHERE id IN (${placeholders})`,
    ids
  );
  return res.affectedRows || 0;
}

async function countUnreadForReceiver(receiverId) {
  const rows = await sqlQuery(
    `SELECT COUNT(*) AS c FROM chat WHERE receiverId = ? AND status = 'UNREAD'`,
    [receiverId]
  );
  return rows[0]?.c || 0;
}

async function getAllForParticipant(userId) {
  const rows = await sqlQuery(
    `SELECT * FROM chat WHERE senderId = ? OR receiverId = ? ORDER BY created DESC`,
    [userId, userId]
  );
  return rows.map(mapRow);
}

module.exports = {
  mapRow,
  addMessage,
  getBetweenUsers,
  getAllForUser,
  getAllForParticipant,
  countBetween,
  countSentFromTo,
  markReadByIds,
  countUnreadForReceiver,
};
