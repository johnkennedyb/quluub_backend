const { sqlQuery } = require('../config/sql');
const userRepo = require('../repositories/userRepository');
const favoritesRepo = require('../repositories/favoritesRepository');
const profileViewRepo = require('../repositories/profileViewRepository');
const { sendWaliAddedNotificationEmail, sendProfileViewEmail, sendEncourageUnhideEmail } = require('../utils/emailService');

function tryJsonParse(val) {
  if (typeof val !== 'string') return null;
  try { return JSON.parse(val); } catch { return null; }
}

function normalizeToStringArray(input) {
  const result = [];
  const queue = [];
  if (input !== undefined) queue.push(input);
  let guard = 0;
  while (queue.length && guard < 1000) {
    guard++;
    const item = queue.shift();
    if (item == null) continue;
    if (Array.isArray(item)) { for (const el of item) queue.push(el); continue; }
    if (typeof item === 'string') {
      let s = item.trim();
      if (!s) continue;
      for (let i = 0; i < 4; i++) {
        const parsed = tryJsonParse(s);
        if (parsed === null) break;
        if (Array.isArray(parsed)) { parsed.forEach(v => queue.push(v)); s = ''; break; }
        if (typeof parsed === 'string') { s = parsed; continue; }
        break;
      }
      if (s) {
        s = s.replace(/^[\[\]"']+|[\[\]"']+$/g, '').trim();
        if (!s || s === '[]') continue;
        result.push(s);
      }
      continue;
    }
    if (typeof item === 'number' || typeof item === 'boolean') { result.push(String(item)); continue; }
  }
  const cleaned = result.map(v => v.trim()).filter(Boolean).filter(v => v !== '[]');
  const unique = Array.from(new Set(cleaned));
  return unique;
}

function normalizeEthnicity(input) {
  const arr = normalizeToStringArray(input).map(s => s.replace(/[\[\]"\\]/g, '').trim()).filter(Boolean);
  const unique = Array.from(new Set(arr));
  return unique.slice(0, 2);
}

async function getUserProfile(req, res) {
  try {
    const userId = req.params.userId || (req.user._id || req.user.id).toString();
    const isOwnProfile = userId === (req.user._id || req.user.id).toString();

    let user = await userRepo.findById(userId);
    if (!user && req.params.userId) {
      user = await userRepo.findByUsername(req.params.userId);
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isOwnProfile) {
      res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    } else {
      res.set({ 'Cache-Control': 'private, max-age=600' });
    }

    delete user.password;
    return res.json(user);
  } catch (err) {
    console.error('Get user profile (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getAllUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const rows = await sqlQuery('SELECT id, fname, lname, email, gender, dob, city, country, createdAt, isActive, plan FROM users ORDER BY createdAt DESC LIMIT ? OFFSET ?', [limit, offset]);
    const countRows = await sqlQuery('SELECT COUNT(*) as cnt FROM users');
    const total = Number(countRows[0].cnt || 0);
    res.json({ users: rows, pagination: { current: page, pages: Math.ceil(total / limit), total } });
  } catch (err) {
    console.error('Get all users (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getBrowseUsers(req, res) {
  try {
    const currentUserId = (req.user._id || req.user.id).toString();
    const currentUser = await userRepo.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const limit = req.query.limit ? parseInt(req.query.limit) : 30;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * limit;

    const where = ['id <> ?', 'COALESCE(hidden, 0) <> 1', 'status IN ("active","pending","NEW")'];
    const params = [currentUserId];

    const desiredGender = currentUser.gender === 'male' ? 'female' : currentUser.gender === 'female' ? 'male' : 'female';
    where.push('gender = ?');
    params.push(desiredGender);

    if (req.query.country) { where.push('country = ?'); params.push(req.query.country); }
    if (req.query.nationality) { where.push('nationality = ?'); params.push(req.query.nationality); }
    if (req.query.hijab === 'Yes') { where.push('hijab = "Yes"'); }
    if (req.query.beard === 'Yes') { where.push('beard = "Yes"'); }
    if (req.query.build) { where.push('build = ?'); params.push(req.query.build); }
    if (req.query.appearance) { where.push('appearance = ?'); params.push(req.query.appearance); }
    if (req.query.genotype) { where.push('genotype = ?'); params.push(req.query.genotype); }
    if (req.query.maritalStatus) { where.push('maritalStatus = ?'); params.push(req.query.maritalStatus); }
    if (req.query.patternOfSalaah) { where.push('patternOfSalaah = ?'); params.push(req.query.patternOfSalaah); }

    if (req.query.minHeight || req.query.maxHeight) {
      const parts = [];
      if (req.query.minHeight) { parts.push('height >= ?'); params.push(parseInt(req.query.minHeight)); }
      if (req.query.maxHeight) { parts.push('height <= ?'); params.push(parseInt(req.query.maxHeight)); }
      if (parts.length) where.push(parts.join(' AND '));
    }

    if (req.query.minWeight || req.query.maxWeight) {
      const parts = [];
      if (req.query.minWeight) { parts.push('weight >= ?'); params.push(parseInt(req.query.minWeight)); }
      if (req.query.maxWeight) { parts.push('weight <= ?'); params.push(parseInt(req.query.maxWeight)); }
      if (parts.length) where.push(parts.join(' AND '));
    }

    if (req.query.minAge || req.query.maxAge) {
      const now = new Date();
      if (req.query.maxAge) {
        const minBirth = new Date(now.getFullYear() - parseInt(req.query.maxAge) - 1, now.getMonth(), now.getDate());
        where.push('dob >= ?'); params.push(minBirth);
      }
      if (req.query.minAge) {
        const maxBirth = new Date(now.getFullYear() - parseInt(req.query.minAge), now.getMonth(), now.getDate());
        where.push('dob <= ?'); params.push(maxBirth);
      }
    }

    let order = 'ORDER BY lastSeen DESC, createdAt DESC';
    if (req.query.sortBy === 'newest') order = 'ORDER BY createdAt DESC';
    if (req.query.sortBy === 'oldest') order = 'ORDER BY createdAt ASC';

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await sqlQuery(`SELECT * FROM users ${whereSql} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const countRows = await sqlQuery(`SELECT COUNT(*) as cnt FROM users ${whereSql}`, params);
    const total = Number(countRows[0]?.cnt || 0);

    res.json({ users: rows.map(r => ({ ...r, password: undefined })), page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Browse users (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateUserProfile(req, res) {
  try {
    const targetId = req.params.id;
    const currentId = (req.user._id || req.user.id).toString();
    if (currentId !== targetId) return res.status(403).json({ message: 'Not authorized to update this profile' });

    const body = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(body, 'ethnicity')) {
      body.ethnicity = normalizeEthnicity(body.ethnicity);
    }
    ['traits', 'interests', 'openToMatches'].forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        const arr = normalizeToStringArray(body[f]);
        body[f] = JSON.stringify(arr);
      }
    });
    if (Object.prototype.hasOwnProperty.call(body, 'waliDetails')) {
      const w = body.waliDetails;
      if (w && typeof w === 'object') body.waliDetails = JSON.stringify(w);
      else if (typeof w === 'string') {
        const parsed = tryJsonParse(w);
        body.waliDetails = parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : w.trim();
      } else if (w == null) delete body.waliDetails;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'dob')) {
      const d = new Date(body.dob); if (!isNaN(d)) body.dob = d; else delete body.dob;
    }

    const before = await userRepo.findById(targetId);
    const updated = await userRepo.updateById(targetId, body);

    if (req.body.waliDetails && updated && updated.waliDetails) {
      try {
        const waliData = typeof updated.waliDetails === 'string' ? JSON.parse(updated.waliDetails) : updated.waliDetails;
        if (waliData && waliData.email && waliData.name) {
          await sendWaliAddedNotificationEmail(waliData.email, waliData.name, `${updated.fname || ''} ${updated.lname || ''}`.trim());
        }
      } catch {}
    }

    if (req.body.hidden !== undefined && req.body.hidden === true) {
      try { await sendEncourageUnhideEmail(updated.email, updated.fname); } catch {}
    }

    return res.json(updated);
  } catch (err) {
    console.error('Update user profile (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function addToFavorites(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const favoriteUserId = req.params.userId;
    if (userId === favoriteUserId) return res.status(400).json({ message: 'You cannot add yourself to favorites' });
    const favoriteUser = await userRepo.findById(favoriteUserId);
    if (!favoriteUser) return res.status(404).json({ message: 'User not found' });
    await favoritesRepo.add(userId, favoriteUserId);
    res.json({ message: 'User added to favorites' });
  } catch (err) {
    console.error('Add to favorites (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function removeFromFavorites(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const favoriteUserId = req.params.userId;
    await favoritesRepo.remove(userId, favoriteUserId);
    res.json({ message: 'User removed from favorites' });
  } catch (err) {
    console.error('Remove from favorites (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getFavorites(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const ids = await favoritesRepo.list(userId);
    const users = await Promise.all(ids.map(id => userRepo.findById(id)));
    res.json({ favorites: users.filter(Boolean).map(u => ({ ...u, password: undefined })) });
  } catch (err) {
    console.error('Get favorites (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProfileViewsCount(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const count = await profileViewRepo.countViews(userId);
    res.json({ profileViews: count });
  } catch (err) {
    console.error('Get profile views count (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function logProfileView(req, res) {
  try {
    const { userId } = req.body;
    const viewerId = (req.user._id || req.user.id).toString();
    if (userId === viewerId) return res.status(200).json({ message: 'Own profile view not logged' });
    const targetUser = await userRepo.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const exists = await profileViewRepo.hasRecentView(viewerId, userId, oneHourAgo);
    if (!exists) {
      await profileViewRepo.logView(viewerId, userId);
      const viewCount = await profileViewRepo.countViews(userId);
      if (viewCount && (viewCount === 5 || viewCount === 10 || viewCount % 25 === 0)) {
        try { await sendProfileViewEmail(targetUser.email, targetUser.fname, viewCount); } catch {}
      }
    }
    res.status(200).json({ message: 'Profile view logged successfully' });
  } catch (err) {
    console.error('Log profile view (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function deleteAccount(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    await sqlQuery('DELETE FROM favorites WHERE user_id = ? OR favorite_user_id = ?', [userId, userId]);
    await sqlQuery('DELETE FROM relationships WHERE follower_user_id = ? OR followed_user_id = ?', [userId, userId]);
    await sqlQuery('DELETE FROM chat WHERE senderId = ? OR receiverId = ?', [userId, userId]);
    await sqlQuery('DELETE FROM video_invitations WHERE inviterId = ? OR inviteeId = ?', [userId, userId]);
    await sqlQuery('DELETE FROM payments WHERE userId = ?', [userId]);
    await userRepo.updateById(userId, { status: 'deleted', hidden: true });
    res.json({ message: 'Account marked as deleted and related records removed.' });
  } catch (err) {
    console.error('Delete account (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function upgradePlan(req, res) {
  try {
    const { email, plan } = req.body;
    const user = await userRepo.findByEmail(email);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await userRepo.updateById(user._id, { plan: plan || 'premium' });
    res.json({ message: 'Plan upgraded successfully' });
  } catch (err) {
    console.error('Upgrade plan (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function debugUsers(req, res) {
  try {
    const totalRows = await sqlQuery('SELECT COUNT(*) as cnt FROM users');
    const totalUsers = Number(totalRows[0]?.cnt || 0);
    const statusCounts = await sqlQuery('SELECT status as _id, COUNT(*) as count FROM users GROUP BY status ORDER BY count DESC');
    const genderCounts = await sqlQuery('SELECT gender as _id, COUNT(*) as count FROM users GROUP BY gender');
    const recentUsers = await sqlQuery('SELECT id, fname, lname, username, status, gender, hidden, createdAt FROM users WHERE createdAt >= (NOW() - INTERVAL 7 DAY) ORDER BY createdAt DESC LIMIT 10');
    res.json({ totalUsers, statusCounts, genderCounts, recentUsers: recentUsers.length, matchingUsers: null, message: 'Debug data (SQL)' });
  } catch (err) {
    console.error('Debug users (SQL) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getBrowseUsers,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  getProfileViewsCount,
  logProfileView,
  deleteAccount,
  upgradePlan,
  debugUsers,
};
