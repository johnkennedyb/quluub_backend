const { sqlQuery } = require('../config/sql');

async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS user_referrals (
      userId VARCHAR(64) PRIMARY KEY,
      referralCode VARCHAR(32) UNIQUE,
      referredBy VARCHAR(64) NULL,
      referralStatus VARCHAR(32) DEFAULT 'None',
      completedReferrals INT DEFAULT 0,
      totalEarnings INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_referredBy (referredBy),
      INDEX idx_status (referralStatus)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getByUserId(userId) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM user_referrals WHERE userId = ? LIMIT 1', [String(userId)]);
  return rows[0] || null;
}

async function upsertUser(userId) {
  await ensureTable();
  await sqlQuery(
    'INSERT INTO user_referrals (userId, referralStatus, completedReferrals, totalEarnings) VALUES (?, "None", 0, 0) ON DUPLICATE KEY UPDATE userId = userId',
    [String(userId)]
  );
  return getByUserId(userId);
}

async function setReferralCode(userId, code) {
  await ensureTable();
  await sqlQuery('UPDATE user_referrals SET referralCode = ? WHERE userId = ?', [code, String(userId)]);
  return getByUserId(userId);
}

async function isReferralCodeTaken(code) {
  await ensureTable();
  const rows = await sqlQuery('SELECT userId FROM user_referrals WHERE referralCode = ? LIMIT 1', [code]);
  return !!rows[0];
}

async function findByReferralCode(code) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM user_referrals WHERE referralCode = ? LIMIT 1', [code]);
  return rows[0] || null;
}

async function applyReferral(userId, referrerId) {
  await ensureTable();
  await sqlQuery('UPDATE user_referrals SET referredBy = ?, referralStatus = ? WHERE userId = ?', [String(referrerId), 'Verified', String(userId)]);
  return getByUserId(userId);
}

async function incrementReferrerStats(referrerId) {
  await ensureTable();
  await sqlQuery('UPDATE user_referrals SET completedReferrals = completedReferrals + 1 WHERE userId = ?', [String(referrerId)]);
  const row = await getByUserId(referrerId);
  return row;
}

async function updateTotalEarnings(referrerId, monthsToAdd) {
  await ensureTable();
  await sqlQuery('UPDATE user_referrals SET totalEarnings = totalEarnings + ? WHERE userId = ?', [monthsToAdd, String(referrerId)]);
  return getByUserId(referrerId);
}

module.exports = {
  getByUserId,
  upsertUser,
  setReferralCode,
  isReferralCodeTaken,
  findByReferralCode,
  applyReferral,
  incrementReferrerStats,
  updateTotalEarnings,
};
