const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  const sql = `CREATE TABLE IF NOT EXISTS video_invitations (
    id varchar(45) NOT NULL,
    senderId varchar(45) NOT NULL,
    receiverId varchar(45) NOT NULL,
    message text,
    roomUrl varchar(1024) DEFAULT NULL,
    hostRoomUrl varchar(1024) DEFAULT NULL,
    roomName varchar(255) DEFAULT NULL,
    meetingId varchar(255) DEFAULT NULL,
    startDate datetime DEFAULT NULL,
    endDate datetime DEFAULT NULL,
    status varchar(20) DEFAULT 'pending',
    created timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted timestamp NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_receiver (receiverId, status, created),
    KEY idx_sender (senderId, created)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
  try {
    await sqlQuery(sql, []);
    ensured = true;
  } catch (e) {
    // If creation fails, subsequent operations will fail; let caller handle
    ensured = true;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    message: row.message,
    roomUrl: row.roomUrl,
    hostRoomUrl: row.hostRoomUrl,
    roomName: row.roomName,
    meetingId: row.meetingId,
    startDate: row.startDate,
    endDate: row.endDate,
    status: (row.status || 'pending').toLowerCase(),
    createdAt: row.created,
    updatedAt: row.updated,
  };
}

async function createInvitation({ senderId, receiverId, message, meetingId, roomUrl, hostRoomUrl, roomName, startDate, endDate }) {
  await ensureTable();
  const id = uuidv4();
  await sqlQuery(
    `INSERT INTO video_invitations (id, senderId, receiverId, message, meetingId, roomUrl, hostRoomUrl, roomName, startDate, endDate, status) 
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`,
    [id, senderId, receiverId, message || null, meetingId || null, roomUrl || null, hostRoomUrl || null, roomName || null, startDate || null, endDate || null]
  );
  const rows = await sqlQuery('SELECT * FROM video_invitations WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function findById(id) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM video_invitations WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function updateStatus(id, status) {
  await ensureTable();
  await sqlQuery('UPDATE video_invitations SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

async function listPendingForReceiver(receiverId) {
  await ensureTable();
  const rows = await sqlQuery(
    `SELECT * FROM video_invitations 
     WHERE receiverId = ? AND (status IS NULL OR LOWER(status) = 'pending') 
       AND created >= (NOW() - INTERVAL 1 DAY)
     ORDER BY created DESC`,
    [receiverId]
  );
  return rows.map(mapRow);
}

module.exports = {
  createInvitation,
  findById,
  updateStatus,
  listPendingForReceiver,
};
