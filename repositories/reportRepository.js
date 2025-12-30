const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(64) PRIMARY KEY,
      reporter VARCHAR(64) NOT NULL,
      reported VARCHAR(64) NOT NULL,
      type VARCHAR(64) DEFAULT 'user_behavior',
      reason TEXT,
      description TEXT,
      status VARCHAR(32) DEFAULT 'pending',
      adminNotes TEXT NULL,
      reviewedAt TIMESTAMP NULL,
      reviewedBy VARCHAR(64) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reporter (reporter),
      INDEX idx_reported (reported),
      INDEX idx_type (type),
      INDEX idx_status (status),
      INDEX idx_created (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function mapJoinedRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    type: row.type || 'user_behavior',
    reporter: {
      _id: row.reporter,
      fullName: `${row.r_fname || ''} ${row.r_lname || ''}`.trim(),
      username: row.r_username || null
    },
    reported: {
      _id: row.reported,
      fullName: `${row.t_fname || ''} ${row.t_lname || ''}`.trim(),
      username: row.t_username || null
    },
    reason: row.reason,
    description: row.description,
    status: row.status,
    adminNotes: row.adminNotes || null,
    reviewedAt: row.reviewedAt || null,
    reviewedBy: row.reviewedBy || null,
    createdAt: row.createdAt,
  };
}

async function create({ reporter, reported, reason, description, type = 'user_behavior' }) {
  await ensureTable();
  const id = uuidv4();
  await sqlQuery(
    'INSERT INTO reports (id, reporter, reported, type, reason, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, reporter, reported, type, reason || '', description || reason || '', 'pending']
  );
  return findByIdJoined(id);
}

async function findByIdJoined(id) {
  await ensureTable();
  const rows = await sqlQuery(
    `SELECT r.*, ur.username AS r_username, ur.fname AS r_fname, ur.lname AS r_lname,
            ut.username AS t_username, ut.fname AS t_fname, ut.lname AS t_lname
     FROM reports r
     LEFT JOIN users ur ON ur.id = r.reporter
     LEFT JOIN users ut ON ut.id = r.reported
     WHERE r.id = ? LIMIT 1`,
    [id]
  );
  return mapJoinedRow(rows[0]);
}

async function list({ page = 1, limit = 20, status, type } = {}) {
  await ensureTable();
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];
  if (status && status !== 'all') { conditions.push('r.status = ?'); params.push(status); }
  if (type && type !== 'all') { conditions.push('r.type = ?'); params.push(type); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await sqlQuery(
    `SELECT r.*, ur.username AS r_username, ur.fname AS r_fname, ur.lname AS r_lname,
            ut.username AS t_username, ut.fname AS t_fname, ut.lname AS t_lname
     FROM reports r
     LEFT JOIN users ur ON ur.id = r.reporter
     LEFT JOIN users ut ON ut.id = r.reported
     ${where}
     ORDER BY r.createdAt DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit) || 20, Number(offset) || 0]
  );
  const totalRows = await sqlQuery(`SELECT COUNT(*) AS cnt FROM reports r ${where}`, params);
  const total = Number(totalRows[0]?.cnt || 0);
  return { reports: rows.map(mapJoinedRow), total };
}

async function updateStatus(id, { status, adminNotes, reviewedBy }) {
  await ensureTable();
  const params = [status, new Date(), adminNotes || null, reviewedBy || null, id];
  await sqlQuery('UPDATE reports SET status = ?, reviewedAt = ?, adminNotes = ?, reviewedBy = ? WHERE id = ?', params);
  return findByIdJoined(id);
}

module.exports = {
  create,
  list,
  updateStatus,
  findByIdJoined,
};
