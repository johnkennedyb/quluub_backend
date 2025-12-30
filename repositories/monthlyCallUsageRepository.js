const { sqlQuery } = require('../config/sql');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS monthly_call_usage (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user1 VARCHAR(64) NOT NULL,
      user2 VARCHAR(64) NOT NULL,
      month VARCHAR(7) NOT NULL, -- YYYY-MM
      totalUsedSeconds INT DEFAULT 0,
      limitExceeded TINYINT(1) DEFAULT 0,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_pair_month (user1, user2, month),
      INDEX idx_users (user1, user2)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function normalizePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function getRemainingTime(userA, userB, limitSeconds = 300) {
  await ensureTable();
  const [u1, u2] = normalizePair(String(userA), String(userB));
  const mk = monthKey();
  const rows = await sqlQuery('SELECT totalUsedSeconds, limitExceeded FROM monthly_call_usage WHERE user1 = ? AND user2 = ? AND month = ? LIMIT 1', [u1, u2, mk]);
  const total = rows[0]?.totalUsedSeconds || 0;
  const exceeded = rows[0]?.limitExceeded === 1 || rows[0]?.limitExceeded === true;
  const remaining = Math.max(0, limitSeconds - total);
  return { hasTimeRemaining: remaining > 0 && !exceeded, totalUsedSeconds: total, monthlyLimitSeconds: limitSeconds, remainingSeconds: remaining, limitExceeded: exceeded };
}

async function addCallDuration(userA, userB, seconds) {
  await ensureTable();
  const [u1, u2] = normalizePair(String(userA), String(userB));
  const mk = monthKey();
  await sqlQuery(
    `INSERT INTO monthly_call_usage (user1, user2, month, totalUsedSeconds, limitExceeded)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE totalUsedSeconds = LEAST(300, totalUsedSeconds + VALUES(totalUsedSeconds)), limitExceeded = (LEAST(300, totalUsedSeconds + VALUES(totalUsedSeconds)) >= 300)`,
    [u1, u2, mk, Math.max(0, parseInt(seconds) || 0), 0]
  );
  const rows = await sqlQuery('SELECT totalUsedSeconds, limitExceeded FROM monthly_call_usage WHERE user1 = ? AND user2 = ? AND month = ? LIMIT 1', [u1, u2, mk]);
  return rows[0] || { totalUsedSeconds: 0, limitExceeded: 0 };
}

async function listPairsForUser(userId) {
  await ensureTable();
  const mk = monthKey();
  const uid = String(userId);
  const rows = await sqlQuery(
    'SELECT user1, user2, month, totalUsedSeconds, limitExceeded, updatedAt FROM monthly_call_usage WHERE month = ? AND (user1 = ? OR user2 = ?) ORDER BY updatedAt DESC',
    [mk, uid, uid]
  );
  return rows.map(r => ({
    user1: r.user1,
    user2: r.user2,
    month: r.month,
    totalUsedSeconds: r.totalUsedSeconds || 0,
    limitExceeded: r.limitExceeded === 1 || r.limitExceeded === true,
    updatedAt: r.updatedAt,
  }));
}

async function resetUsage(userA, userB) {
  await ensureTable();
  const [u1, u2] = normalizePair(String(userA), String(userB));
  const mk = monthKey();
  const res = await sqlQuery(
    'UPDATE monthly_call_usage SET totalUsedSeconds = 0, limitExceeded = 0 WHERE user1 = ? AND user2 = ? AND month = ?',
    [u1, u2, mk]
  );
  if (!res.affectedRows) {
    await sqlQuery(
      'INSERT INTO monthly_call_usage (user1, user2, month, totalUsedSeconds, limitExceeded) VALUES (?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE totalUsedSeconds = 0, limitExceeded = 0',
      [u1, u2, mk]
    );
  }
  return { user1: u1, user2: u2, month: mk, totalUsedSeconds: 0, limitExceeded: 0 };
}

module.exports = { getRemainingTime, addCallDuration, listPairsForUser, resetUsage };
