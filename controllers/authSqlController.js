const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const generateToken = require('../utils/generateToken');
const User = require('../models/User');
const userRepo = require('../repositories/userRepository');
const mongoAuth = require('./authController');
const { sendWelcomeEmail, sendPlanExpiredEmail, sendValidationEmail } = require('../utils/emailService');

// Helper: ensure Mongo <-> SQL sync for the given Mongo user
async function mirrorToSql(mongoUser) {
  try { await userRepo.upsertFromMongo(mongoUser); } catch (e) {}
}

// Helper: plan expiration enforcement on Mongo, then mirror to SQL
async function enforcePlanExpiration(user) {
  try {
    if (
      user.plan === 'premium' &&
      user.premiumExpirationDate &&
      new Date(user.premiumExpirationDate) < new Date()
    ) {
      user.plan = 'freemium';
      user.premiumExpirationDate = null;
      await user.save();
      try { sendPlanExpiredEmail(user.email, user.fname); } catch (e) {}
      await mirrorToSql(user);
    }
  } catch {}
}

// POST /auth/signup
async function signup(req, res) {
  try {
    const {
      username, email, password, fname, lname, gender,
      ethnicity, dob, dateOfBirth,
      country, state, city, countryOfResidence, stateOfResidence, cityOfResidence,
      summary, kunya, nationality, region, height, weight, build, appearance,
      hijab, beard, maritalStatus, noOfChildren, patternOfSalaah, revert,
      sect, scholarsSpeakers, dressingCovering, islamicPractice, genotype,
      workEducation, traits, interests, openToMatches, dealbreakers, icebreakers,
      waliDetails
    } = req.body;

    if (!username || !email || !password || !fname || !lname || !gender) {
      return res.status(400).json({ message: 'All fields are required: username, email, password, fname, lname, gender' });
    }

    const [existingSql, existingMongo] = await Promise.all([
      userRepo.findByUsernameOrEmail(username) || userRepo.findByEmail(email),
      User.findOne({ $or: [{ email }, { username }] })
    ]);
    if (existingSql || existingMongo) {
      return res.status(400).json({ message: existingMongo?.email === email ? 'Email already registered' : 'Username already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create in Mongo first (authoritative during migration)
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      fname,
      lname,
      gender,
      type: 'USER',
      kunya,
      dob: dob || dateOfBirth,
      nationality,
      country: country || countryOfResidence,
      state: state || stateOfResidence,
      city: city || cityOfResidence,
      region,
      height,
      weight,
      build,
      appearance,
      hijab: hijab || 'No',
      beard: beard || 'No',
      maritalStatus,
      noOfChildren,
      ethnicity: ethnicity || [],
      patternOfSalaah,
      revert,
      sect,
      scholarsSpeakers,
      dressingCovering,
      islamicPractice,
      genotype,
      summary,
      workEducation,
      traits,
      interests,
      openToMatches,
      dealbreakers,
      icebreakers,
      waliDetails: waliDetails || ''
    });

    // Mirror to SQL
    await mirrorToSql(user);

    try {
      user.emailVerified = true;
      await user.save();
      await mirrorToSql(user);
      try { sendWelcomeEmail(user.email, user.fname); } catch {}
    } catch {}

    const token = generateToken(user._id);
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      fname: user.fname,
      lname: user.lname,
      gender: user.gender,
      type: user.type,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fname: user.fname,
        lname: user.lname,
        gender: user.gender,
        type: user.type,
      }
    });
  } catch (error) {
    console.error('SQL signup error:', error);
    res.status(500).json({ message: 'Server error during signup' });
  }
}

// POST /auth/admin/signup
async function adminSignup(req, res) {
  try {
    const { username, email, password, fname, lname, adminKey } = req.body;
    const ADMIN_SIGNUP_KEY = process.env.ADMIN_SIGNUP_KEY || 'admin123';
    if (adminKey !== ADMIN_SIGNUP_KEY) {
      return res.status(403).json({ message: 'Invalid admin key' });
    }
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ message: existing.email === email ? 'Email already registered' : 'Username already taken' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({ username, email, password: hashedPassword, fname, lname, gender: 'male', type: 'ADMIN', status: 'active' });
    await mirrorToSql(user);
    const token = generateToken(user._id);
    res.status(201).json({ _id: user._id, username: user.username, email: user.email, fname: user.fname, lname: user.lname, type: user.type, token, user: { _id: user._id, username: user.username, email: user.email, fname: user.fname, lname: user.lname, type: user.type } });
  } catch (error) {
    console.error('SQL admin signup error:', error);
    res.status(500).json({ message: 'Server error during admin signup' });
  }
}

// POST /auth/login
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

    // Prefer SQL if available, fallback to Mongo
    let sqlUser = await userRepo.findByUsernameOrEmail(username);
    let user;
    if (!sqlUser) {
      user = await User.findOne({ $or: [{ username }, { email: username }] });
      if (!user) return res.status(401).json({ message: 'No account found with this username or email' });
      // Mirror Mongo -> SQL for next time
      await mirrorToSql(user);
    } else {
      // Load Mongo by email to maintain existing downstream behavior (req.user, relations)
      user = await User.findOne({ email: sqlUser.email }) || await User.findOne({ username: sqlUser.username });
      if (!user) {
        // Create minimal Mongo doc to keep middlewares working
        user = await User.create({
          username: sqlUser.username,
          email: sqlUser.email,
          password: sqlUser.password,
          fname: sqlUser.fname,
          lname: sqlUser.lname,
          gender: sqlUser.gender || 'male',
          type: sqlUser.type || 'USER',
          plan: sqlUser.plan || 'freemium',
        });
      }
    }

    const passwordHash = sqlUser?.password || user.password;
    const ok = await bcrypt.compare(password, passwordHash);
    if (!ok) return res.status(401).json({ message: 'Incorrect password. Please try again' });

    if (user.gender !== 'male' && user.gender !== 'female') {
      try { user.gender = 'male'; await user.save(); } catch {}
    }

    await enforcePlanExpiration(user);

    const token = generateToken(user._id);
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      fname: user.fname,
      lname: user.lname,
      gender: user.gender,
      type: user.type,
      dob: user.dob,
      country: user.country,
      city: user.city,
      ethnicity: user.ethnicity,
      plan: user.plan,
      premiumExpirationDate: user.premiumExpirationDate,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fname: user.fname,
        lname: user.lname,
        gender: user.gender,
        type: user.type,
        dob: user.dob,
        country: user.country,
        city: user.city,
        ethnicity: user.ethnicity,
        plan: user.plan,
        premiumExpirationDate: user.premiumExpirationDate
      }
    });

    // Fire-and-forget: update lastSeen in both stores
    user.lastSeen = new Date();
    user.save().catch(() => {});
    if (sqlUser) { try { await userRepo.updateById(sqlUser._id, { lastSeen: new Date() }); } catch {} }
    else { try { await mirrorToSql(user); } catch {} }
  } catch (error) {
    console.error('SQL login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
}

// POST /auth/google
async function googleAuth(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Authorization code is required' });

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.CLIENT_URL || 'http://localhost:8080'}/auth/google/callback`;
    if (!googleClientId || !googleClientSecret) return res.status(500).json({ message: 'Server configuration error.' });

    const tokenResp = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const accessToken = tokenResp.data.access_token;
    const userResp = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    const googleUser = userResp.data;

    let user = await User.findOne({ email: googleUser.email });
    if (user) {
      user.lastSeen = new Date();
      if (!user.googleId) user.googleId = googleUser.id;
      await user.save();
      await mirrorToSql(user);
    } else {
      const username = googleUser.email.split('@')[0] + Math.random().toString(36).substr(2, 4);
      user = await User.create({
        fname: googleUser.given_name || googleUser.name?.split(' ')[0] || 'User',
        lname: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '',
        email: googleUser.email,
        username,
        googleId: googleUser.id,
        password: crypto.randomBytes(32).toString('hex'),
        emailVerified: googleUser.verified_email || true,
        status: 'active',
        plan: 'freemium',
        gender: 'male',
        lastSeen: new Date(),
        type: 'USER'
      });
      await mirrorToSql(user);
    }

    if (user.gender !== 'male' && user.gender !== 'female') {
      try { user.gender = 'male'; await user.save(); await mirrorToSql(user); } catch {}
    }
    await enforcePlanExpiration(user);

    const token = generateToken(user._id);
    res.json({ token, user: { _id: user._id, id: user._id, fname: user.fname, lname: user.lname, email: user.email, username: user.username, plan: user.plan, premiumExpirationDate: user.premiumExpirationDate, status: user.status, type: user.type, gender: user.gender } });
  } catch (error) {
    console.error('SQL Google auth error:', error);
    res.status(500).json({ message: 'Server error during Google authentication' });
  }
}

// GET /auth/profile
async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /auth/change-password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    try { await userRepo.updateById(user._id.toString(), { password: user.password }); } catch {}
    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /auth/resend-validation
async function resendValidationEmail(req, res) {
  // Delegate to Mongo controller to keep original flow (SQL schema may not have validation columns)
  return mongoAuth.resendValidationEmail(req, res);
}

module.exports = {
  signup,
  adminSignup,
  login,
  googleAuth,
  getUserProfile,
  changePassword,
  resendValidationEmail,
};
