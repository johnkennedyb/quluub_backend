const { sqlQuery } = require('../config/sql');

// Auto-create payments table if not exists
async function ensureTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      userId VARCHAR(64) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      status VARCHAR(32) NOT NULL,
      transactionId VARCHAR(255) NOT NULL,
      paymentGateway VARCHAR(32) NOT NULL,
      plan VARCHAR(32) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_userId (userId),
      UNIQUE KEY uniq_tx (transactionId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function createPayment(payment) {
  await ensureTable();
  const id = payment.id || payment.transactionId;
  await sqlQuery(
    `INSERT INTO payments (id, userId, amount, currency, status, transactionId, paymentGateway, plan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [
      id,
      payment.userId,
      payment.amount,
      (payment.currency || 'USD').toUpperCase(),
      payment.status,
      payment.transactionId,
      payment.paymentGateway,
      payment.plan || 'premium',
    ]
  );
  return { id, ...payment };
}

async function findByTransactionId(txId) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM payments WHERE transactionId = ? LIMIT 1', [txId]);
  return rows[0] || null;
}

async function listByUserId(userId, limit = 50) {
  await ensureTable();
  const rows = await sqlQuery('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC LIMIT ?', [userId, Number(limit) || 50]);
  return rows;
}

module.exports = {
  createPayment,
  findByTransactionId,
  listByUserId,
};
