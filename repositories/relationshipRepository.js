const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    follower_user_id: row.follower_user_id,
    followed_user_id: row.followed_user_id,
    status: (row.status || 'pending').toLowerCase(),
    created: row.created,
    updated: row.updated,
  };
}

async function createRequest({ follower_user_id, followed_user_id }) {
  const id = uuidv4();
  await sqlQuery(
    'INSERT INTO relationships (id, follower_user_id, followed_user_id, status) VALUES (?,?,?,?)',
    [id, follower_user_id, followed_user_id, 'pending']
  );
  const rows = await sqlQuery('SELECT * FROM relationships WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function getById(id) {
  const rows = await sqlQuery('SELECT * FROM relationships WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function getByPair(follower_user_id, followed_user_id) {
  const rows = await sqlQuery(
    'SELECT * FROM relationships WHERE follower_user_id = ? AND followed_user_id = ? LIMIT 1',
    [follower_user_id, followed_user_id]
  );
  return mapRow(rows[0]);
}

async function updateStatus(id, status) {
  await sqlQuery('UPDATE relationships SET status = ? WHERE id = ?', [status, id]);
  return getById(id);
}

async function deleteById(id) {
  await sqlQuery('DELETE FROM relationships WHERE id = ?', [id]);
}

async function listMatches(userId) {
  const rows = await sqlQuery(
    'SELECT * FROM relationships WHERE (follower_user_id = ? OR followed_user_id = ?) AND LOWER(status) = "matched" ORDER BY updated DESC',
    [userId, userId]
  );
  return rows.map(mapRow);
}

async function listPendingForFollowed(userId) {
  const rows = await sqlQuery(
    'SELECT * FROM relationships WHERE followed_user_id = ? AND LOWER(status) = "pending" ORDER BY created DESC',
    [userId]
  );
  return rows.map(mapRow);
}

async function listPendingSentByFollower(userId) {
  const rows = await sqlQuery(
    'SELECT * FROM relationships WHERE follower_user_id = ? AND LOWER(status) = "pending" ORDER BY created DESC',
    [userId]
  );
  return rows.map(mapRow);
}

module.exports = {
  createRequest,
  getById,
  getByPair,
  updateStatus,
  deleteById,
  listMatches,
  listPendingForFollowed,
  listPendingSentByFollower,
};
