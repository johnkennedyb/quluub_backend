const { v4: uuidv4 } = require('uuid');
const { sqlQuery } = require('../config/sql');
const User = require('../models/User');
const Relationship = require('../models/Relationship');
const Chat = require('../models/Chat');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const UserActivityLog = require('../models/UserActivityLog');
const MonthlyCallUsage = require('../models/MonthlyCallUsage');
const userRepo = require('../repositories/userRepository');

async function ensureNotificationsTable() {
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

async function ensureReportsTable() {
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

async function ensureProfileViewsTable() {
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

async function ensureMonthlyUsageTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS monthly_call_usage (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user1 VARCHAR(64) NOT NULL,
      user2 VARCHAR(64) NOT NULL,
      month VARCHAR(7) NOT NULL,
      totalUsedSeconds INT DEFAULT 0,
      limitExceeded TINYINT(1) DEFAULT 0,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_pair_month (user1, user2, month),
      INDEX idx_users (user1, user2)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureChatTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS chat (
      id VARCHAR(64) PRIMARY KEY,
      senderId VARCHAR(64) NOT NULL,
      receiverId VARCHAR(64) NOT NULL,
      message TEXT,
      status VARCHAR(16) DEFAULT 'UNREAD',
      created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated TIMESTAMP NULL,
      INDEX idx_sender (senderId),
      INDEX idx_receiver (receiverId),
      INDEX idx_created (created)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureRelationshipsTable() {
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS relationships (
      id VARCHAR(64) PRIMARY KEY,
      follower_user_id VARCHAR(64) NOT NULL,
      followed_user_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) DEFAULT 'pending',
      created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated TIMESTAMP NULL,
      INDEX idx_follower (follower_user_id),
      INDEX idx_followed (followed_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function runUsers(limit = 500) {
  let page = 0;
  let migrated = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const users = await User.find({}).skip(page * limit).limit(limit).lean();
    if (!users.length) break;
    for (const u of users) {
      try {
        await userRepo.upsertFromMongo(u);
        migrated += 1;
      } catch (e) {
        // continue
      }

    }
    page += 1;
  }
  return { migrated };
}

async function runNotifications(limit = 2000) {
  await ensureNotificationsTable();
  let page = 0;
  let migrated = 0;
  while (true) {
    const docs = await Notification.find({}).skip(page * limit).limit(limit).lean();
    if (!docs.length) break;
    for (const n of docs) {
      try {
        const id = String(n._id);
        const userId = String(n.user);
        const title = null;
        const message = n.message || '';
        const type = n.type || 'general';
        const data = n.data ? JSON.stringify(n.data) : null;
        const isRead = n.read ? 1 : 0;
        const createdAt = n.createdAt ? new Date(n.createdAt) : new Date();
        await sqlQuery(
          `INSERT INTO notifications (id, userId, title, message, type, data, isRead, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE message = VALUES(message), isRead = VALUES(isRead)`,
          [id, userId, title, message, type, data, isRead, createdAt]
        );
        migrated += 1;
      } catch (e) {
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runReports(limit = 1000) {
  await ensureReportsTable();
  let page = 0;
  let migrated = 0;
  while (true) {
    const docs = await Report.find({}).skip(page * limit).limit(limit).lean();
    if (!docs.length) break;
    for (const r of docs) {
      try {
        const id = String(r._id);
        const reporter = String(r.reporter);
        const reported = String(r.reported);
        const type = 'user_behavior';
        const reason = r.reason || '';
        const description = r.description || '';
        const status = r.status || 'pending';
        const adminNotes = r.adminNotes || null;
        const reviewedAt = r.reviewedAt ? new Date(r.reviewedAt) : null;
        const reviewedBy = r.reviewedBy ? String(r.reviewedBy) : null;
        const createdAt = r.createdAt ? new Date(r.createdAt) : new Date();
        await sqlQuery(
          `INSERT INTO reports (id, reporter, reported, type, reason, description, status, adminNotes, reviewedAt, reviewedBy, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), adminNotes = VALUES(adminNotes), reviewedAt = VALUES(reviewedAt), reviewedBy = VALUES(reviewedBy)`,
          [id, reporter, reported, type, reason, description, status, adminNotes, reviewedAt, reviewedBy, createdAt]
        );
        migrated += 1;
      } catch (e) {
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runProfileViews(limit = 5000) {
  await ensureProfileViewsTable();
  let page = 0;
  let migrated = 0;
  while (true) {
    const docs = await UserActivityLog.find({ action: 'PROFILE_VIEW' }).skip(page * limit).limit(limit).lean();
    if (!docs.length) break;
    for (const v of docs) {
      try {
        const userId = String(v.receiverId);
        const viewerId = String(v.userId);
        const createdAt = v.created ? new Date(v.created) : (v.createdAt ? new Date(v.createdAt) : new Date());
        await sqlQuery(
          'INSERT INTO profile_views (user_id, viewer_id, createdAt) VALUES (?, ?, ?)',
          [userId, viewerId, createdAt]
        );
        migrated += 1;
      } catch (e) {
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runMonthlyUsage(limit = 1000) {
  await ensureMonthlyUsageTable();
  let page = 0;
  let migrated = 0;
  while (true) {
    const docs = await MonthlyCallUsage.find({}).skip(page * limit).limit(limit).lean();
    if (!docs.length) break;
    for (const u of docs) {
      try {
        const a = String(u.user1);
        const b = String(u.user2);
        const [user1, user2] = a < b ? [a, b] : [b, a];
        const mk = `${u.year}-${String(u.month).padStart(2, '0')}`;
        const total = Math.max(0, parseInt(u.totalSecondsUsed || u.totalTimeSpent || 0));
        const capped = Math.min(300, total);
        const exceeded = capped >= 300 || !!u.limitReachedAt || !!u.limitExceeded;
        const updatedAt = u.lastUpdated ? new Date(u.lastUpdated) : new Date();
        await sqlQuery(
          `INSERT INTO monthly_call_usage (user1, user2, month, totalUsedSeconds, limitExceeded, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE totalUsedSeconds = GREATEST(totalUsedSeconds, VALUES(totalUsedSeconds)), limitExceeded = VALUES(limitExceeded), updatedAt = VALUES(updatedAt)`,
          [user1, user2, mk, capped, exceeded ? 1 : 0, updatedAt]
        );
        migrated += 1;
      } catch (e) {
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runRelationships(limit = 1000) {
  await ensureRelationshipsTable();
  let page = 0;
  let migrated = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rels = await Relationship.find({}).skip(page * limit).limit(limit).lean();
    if (!rels.length) break;
    for (const r of rels) {
      try {
        const id = r.id || uuidv4();
        const follower = String(r.follower_user_id);
        const followed = String(r.followed_user_id);
        const status = (r.status || 'pending').toLowerCase();
        await sqlQuery(
          `INSERT INTO relationships (id, follower_user_id, followed_user_id, status)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [id, follower, followed, status]
        );
        migrated += 1;
      } catch (e) {
        // continue
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runChats(limit = 2000) {
  await ensureChatTable();
  let page = 0;
  let migrated = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const msgs = await Chat.find({}).skip(page * limit).limit(limit).lean();
    if (!msgs.length) break;
    for (const m of msgs) {
      try {
        const id = String(m._id);
        const senderId = String(m.senderId);
        const receiverId = String(m.receiverId);
        const message = m.message || '';
        const status = m.status || 'UNREAD';
        const created = m.created ? new Date(m.created) : new Date();
        await sqlQuery(
          `INSERT INTO chat (id, senderId, receiverId, message, status, created)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE message = message`,
          [id, senderId, receiverId, message, status, created]
        );
        migrated += 1;
      } catch (e) {
        // continue
      }
    }
    page += 1;
  }
  return { migrated };
}

async function runAll(req, res) {
  try {
    if (process.env.SQL_REQUIRED === 'true') {
      return res.status(503).json({ message: 'Backfill requires Mongo connection. Set SQL_REQUIRED=false temporarily.' });
    }
    const startedAt = new Date().toISOString();
    const users = await runUsers();
    const rels = await runRelationships();
    const chats = await runChats();
    const notifs = await runNotifications();
    const reports = await runReports();
    const views = await runProfileViews();
    const monthly = await runMonthlyUsage();
    const finishedAt = new Date().toISOString();
    return res.json({
      success: true,
      startedAt,
      finishedAt,
      usersMigrated: users.migrated,
      relationshipsMigrated: rels.migrated,
      chatsMigrated: chats.migrated,
      notificationsMigrated: notifs.migrated,
      reportsMigrated: reports.migrated,
      profileViewsMigrated: views.migrated,
      monthlyUsageMigrated: monthly.migrated,
    });
  } catch (err) {
    console.error('SQL backfill error:', err);
    return res.status(500).json({ success: false, message: 'Backfill failed', error: err.message });
  }
}

module.exports = { runAll };
