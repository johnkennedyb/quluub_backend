
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const generateToken = require('../utils/generateToken');
const crypto = require('crypto');
const axios = require('axios');
const { sendValidationEmail, sendWelcomeEmail, sendPlanExpiredEmail } = require('../utils/emailService');
const userRepo = require('../repositories/userRepository');

// Regular signup
const signup = async (req, res) => {
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

    console.log('Signup attempt:', { username, email, fname, lname, gender });

    // Validate required fields
    if (!username || !email || !password || !fname || !lname || !gender) {
      return res.status(400).json({ 
        message: 'All fields are required: username, email, password, fname, lname, gender' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      fname,
      lname,
      gender,
      type: 'USER',
      // Basic Profile Info
      kunya,
      // Date of Birth
      dob: dob || dateOfBirth, // Accept both dob and dateOfBirth fields
      // Location and Demographics
      nationality,
      country: country || countryOfResidence, // Accept both formats
      state: state || stateOfResidence, // Accept both formats
      city: city || cityOfResidence, // Accept both formats
      region,
      // Physical Appearance
      height,
      weight,
      build,
      appearance,
      hijab: hijab || 'No',
      beard: beard || 'No',
      // Family and Marital
      maritalStatus,
      noOfChildren,
      // Ethnicity
      ethnicity: ethnicity || [],
      // Islamic Practice and Deen
      patternOfSalaah,
      revert,
      sect,
      scholarsSpeakers,
      dressingCovering,
      islamicPractice,
      // Medical and Health
      genotype,
      // Profile Content
      summary,
      workEducation,
      // Lifestyle and Personality (JSON strings for arrays)
      traits,
      interests,
      // Matching Preferences
      openToMatches,
      dealbreakers,
      icebreakers,
      // Wali Details
      waliDetails: waliDetails || ''
    });

    if (user) {
      // Send welcome email only (email already verified during pre-signup)
      try {
        // Mark email as verified since user completed pre-signup verification
        user.emailVerified = true;
        await user.save();

        // Only send welcome email - no verification needed
        sendWelcomeEmail(user.email, user.fname);

      } catch (emailError) {
        console.error('Error sending emails during signup:', emailError);
      }

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
          type: user.type
        }
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup' });
  }
};

// Admin signup
const adminSignup = async (req, res) => {
  try {
    const { username, email, password, fname, lname, adminKey } = req.body;

    console.log('Admin signup attempt:', { username, email, fname, lname });

    // Verify admin key (you should set this in your environment variables)
    const ADMIN_SIGNUP_KEY = process.env.ADMIN_SIGNUP_KEY || 'admin123';
    if (adminKey !== ADMIN_SIGNUP_KEY) {
      return res.status(403).json({ message: 'Invalid admin key' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
      });
    }

    // Hash password for admin too
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      fname,
      lname,
      gender: 'male', // Restrict to male/female only; default admin gender
      type: 'ADMIN',
      status: 'active' // Admin accounts are active by default
    });

    if (user) {
      const token = generateToken(user._id);
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        fname: user.fname,
        lname: user.lname,
        type: user.type,
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          fname: user.fname,
          lname: user.lname,
          type: user.type
        }
      });
    } else {
      res.status(400).json({ message: 'Invalid admin data' });
    }
  } catch (error) {
    console.error('Admin signup error:', error);
    res.status(500).json({ message: 'Server error during admin signup' });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('Login attempt:', { username });

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (user && (await bcrypt.compare(password, user.password))) {
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
        }
      } catch (e) {}
      // Ensure gender is valid (male/female only); auto-correct legacy values
      if (user.gender !== 'male' && user.gender !== 'female') {
        try {
          user.gender = 'male';
          await user.save();
          console.log(' Fixed invalid gender for user during login; set to male');
        } catch (gErr) {
          console.warn(' Failed to auto-fix gender during login:', gErr?.message || gErr);
        }
      }
      const token = generateToken(user._id);
      
      console.log(` Login successful for: ${username} (Type: ${user.type})`);
      
      // PERFORMANCE FIX: Respond to the user immediately with all profile data
      // Include profile completeness fields: dob, country, city, ethnicity
      // Include payment status fields: plan, premiumExpirationDate
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

      // 🔥 FIRE AND FORGET: Update lastSeen in the background.
      user.lastSeen = new Date();
      user.save().catch(err => {
        console.error('Error updating lastSeen in background:', err);
      });

     } else {
      console.log(`❌ Login failed for: ${username}`);
      
      // Check if user exists to provide more specific error
      const userExists = await User.findOne({
        $or: [{ username }, { email: username }]
      });
      
      if (!userExists) {
        res.status(401).json({ message: 'No account found with this username or email' });
      } else {
        res.status(401).json({ message: 'Incorrect password. Please try again' });
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Google OAuth handler
const googleAuth = async (req, res) => {
  try {
    const { code } = req.body;
    console.log('Google OAuth: Received authorization code');

    if (!code) {
      return res.status(400).json({ message: 'Authorization code is required' });
    }

    // 🔒 SECURITY FIX: Use environment variables for secrets.
    // NEVER hardcode secrets in your code. Add these to your .env file.
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.CLIENT_URL || 'http://localhost:8080'}/auth/google/callback`;

    if (!googleClientId || !googleClientSecret) {
        console.error('Google OAuth credentials are not configured in environment variables.');
        return res.status(500).json({ message: 'Server configuration error.' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Google OAuth: Token exchange response received');

    if (!tokenResponse.ok) {
      console.error('Google OAuth: Token exchange failed:', tokenData);
      return res.status(400).json({ message: 'Failed to exchange authorization code' });
    }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userResponse.json();
    console.log('Google OAuth: User info received:', { email: googleUser.email, name: googleUser.name });

    if (!userResponse.ok) {
      console.error('Google OAuth: Failed to get user info:', googleUser);
      return res.status(400).json({ message: 'Failed to get user information from Google' });
    }

    let user = await User.findOne({ email: googleUser.email });

    if (user) {
      // Update existing user
      user.lastSeen = new Date();
      if (!user.googleId) {
        user.googleId = googleUser.id;
      }
      await user.save();
      console.log('Google OAuth: Existing user signed in:', user.email);
    } else {
      // Create new user with default gender (male/female only)
      const username = googleUser.email.split('@')[0] + Math.random().toString(36).substr(2, 4);
      
      user = new User({
        fname: googleUser.given_name || googleUser.name?.split(' ')[0] || 'User',
        lname: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '',
        email: googleUser.email,
        username,
        googleId: googleUser.id,
        password: crypto.randomBytes(32).toString('hex'), // Random password for Google users
        emailVerified: googleUser.verified_email || true,
        status: 'active',
        plan: 'freemium',
        gender: 'male', // Temporary default; user can update to female in profile
        lastSeen: new Date(),
        type: 'USER'
      });

      await user.save();
      console.log('Google OAuth: New user created:', user.email);
    }

    // Ensure gender is valid (male/female only) after Google auth
    if (user.gender !== 'male' && user.gender !== 'female') {
      try {
        user.gender = 'male';
        await user.save();
        console.log(' Fixed invalid gender for Google user; set to male');
      } catch (gErr) {
        console.warn(' Failed to auto-fix gender after Google auth:', gErr?.message || gErr);
      }
    }
    // Enforce premium expiration
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
      }
    } catch (e) {}

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        username: user.username,
        plan: user.plan,
        premiumExpirationDate: user.premiumExpirationDate,
        status: user.status,
        type: user.type,
        gender: user.gender
      }
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ message: 'Server error during Google authentication' });
  }
};

// Get user profile
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const resendValidationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // To prevent email enumeration, we send a success response even if the user doesn't exist.
      return res.status(200).json({ message: 'If your email is registered, you will receive a verification link.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'This email has already been verified.' });
    }

    // Create a new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Send the email
    try {
      await sendValidationEmail(user.email, user.fname, verificationToken);
      res.status(200).json({ message: 'A new verification email has been sent.' });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      res.status(500).json({ message: 'There was an error sending the verification email.' });
    }

  } catch (error) {
    console.error('Resend validation email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  signup,
  adminSignup,
  login,
  googleAuth,
  getUserProfile,
  getAllUsers,
  changePassword,
  resendValidationEmail
};