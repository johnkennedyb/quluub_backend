const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog');
const bcrypt = require('bcryptjs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendWaliAddedNotificationEmail, sendProfileViewEmail, sendEncourageUnhideEmail } = require('../utils/emailService');

// Simple in-memory cache for profile data
const profileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to clear profile cache
const clearProfileCache = (userId) => {
  const keys = Array.from(profileCache.keys());
  keys.forEach(key => {
    if (key.startsWith(`profile_${userId}_`)) {
      profileCache.delete(key);
    }
  });
};

// Periodic cache cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const keysToDelete = [];
  
  for (const [key, value] of profileCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => profileCache.delete(key));
  
  if (keysToDelete.length > 0) {
    console.log(`🧹 Cleaned up ${keysToDelete.length} expired profile cache entries`);
  }
}, CACHE_TTL); // Run cleanup every 5 minutes

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const isOwnProfile = userId === req.user._id.toString();
    const cacheKey = `profile_${userId}_${isOwnProfile ? 'own' : 'public'}`;
    
    // Check cache first (skip cache for own profile to ensure fresh data)
    if (!isOwnProfile && profileCache.has(cacheKey)) {
      const cached = profileCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        res.set({
          'Cache-Control': 'private, max-age=600',
          'X-Cache': 'HIT'
        });
        return res.json(cached.data);
      } else {
        profileCache.delete(cacheKey);
      }
    }
    
    // Optimize field selection based on profile type
    let selectFields = '-password -resetPasswordToken -resetPasswordTokenExpiration -validationToken';
    
    // For viewing others' profiles, exclude sensitive fields
    if (!isOwnProfile) {
      selectFields += ' -email -phoneNumber -favorites -blockedUsers -reportedUsers';

      // Conditionally exclude waliDetails only if the user is not female
      const viewedUser = await User.findById(userId).select('gender').lean();
      if (viewedUser && viewedUser.gender !== 'female') {
        selectFields += ' -waliDetails';
      }
    }
    
    // Note: summary field will be included by default since we're only excluding specific fields
    
    // Determine if userId is a valid ObjectId or a username
    let user;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      // It's a valid ObjectId, search by _id
      user = await User.findById(userId)
        .select(selectFields)
        .lean();
    } else {
      // It's likely a username, search by username
      user = await User.findOne({ username: userId })
        .select(selectFields)
        .lean();
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Cache public profiles only
    if (!isOwnProfile) {
      profileCache.set(cacheKey, {
        data: user,
        timestamp: Date.now()
      });
    }

    // Set cache headers
    // For own profile, disable caching completely to ensure immediate consistency after updates
    // For public profiles, allow short-lived private caching for performance
    if (isOwnProfile) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Cache': 'MISS'
      });
    } else {
      res.set({
        'Cache-Control': 'private, max-age=600',
        'ETag': `"${user._id}-${user.updatedAt || user.createdAt}"`,
        'X-Cache': 'MISS'
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all users (for admin)
// @route   GET /api/users/users
// @access  Private
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Optimized query with pagination and minimal fields
    const users = await User.find()
      .select('fname lname email gender age city country createdAt isActive isPremium')
      .limit(limit)
      .skip(skip)
      .lean();
      
    const total = await User.countDocuments();
    
    res.json({
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Lightweight helpers for input normalization (no external imports)
const tryJsonParse = (val) => {
  if (typeof val !== 'string') return null;
  try { return JSON.parse(val); } catch { return null; }
};

const normalizeToStringArray = (input) => {
  const result = [];
  const queue = [];
  if (input !== undefined) queue.push(input);
  let guard = 0;
  while (queue.length && guard < 1000) {
    guard++;
    const item = queue.shift();
    if (item == null) continue;
    if (Array.isArray(item)) {
      for (const el of item) queue.push(el);
      continue;
    }
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
        if (s.startsWith('["') && s.endsWith('"]')) {
          const arr = tryJsonParse(s);
          if (Array.isArray(arr)) { arr.forEach(v => queue.push(v)); continue; }
        }
        s = s.replace(/^[\[\]\"']+|[\[\]\"']+$/g, '').trim();
        if (!s || s === '[]') continue;
        result.push(s);
      }
      continue;
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      result.push(String(item));
      continue;
    }
  }
  const cleaned = result.map(v => v.trim()).filter(Boolean).filter(v => v !== '[]');
  const unique = Array.from(new Set(cleaned));
  return unique;
};

const normalizeEthnicity = (input) => {
  const arr = normalizeToStringArray(input).map(s => s.replace(/[\[\]"\\]/g, '').trim()).filter(Boolean);
  const unique = Array.from(new Set(arr));
  return unique.slice(0, 2);
};

// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    console.log('🔥 Backend updateUserProfile called');
    console.log('👤 Request user ID:', req.user._id.toString());
    console.log('🎯 Target user ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📊 Request body keys:', Object.keys(req.body));
    
    // Only allow updating own profile unless admin
    if (req.user._id.toString() !== req.params.id) {
      console.log('❌ Authorization failed: user trying to update different profile');
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('✅ User found, proceeding with update...');
    console.log('📋 Current user data before update:', {
      fname: user.fname,
      lname: user.lname,
      country: user.country,
      city: user.city,
      skinColor: user.skinColor,
      facialAttractiveness: user.facialAttractiveness
    });
    
    // Update fields - COMPREHENSIVE LIST including all ProfileEditSections fields
    const updatableFields = [
      // Basic Info
      'fname', 'lname', 'kunya', 'dob', 'maritalStatus', 'noOfChildren', 
      'summary', 'workEducation', 'profile_pic', 'hidden',
      
      // Location and Ethnicity
      'nationality', 'country', 'state', 'city', 'region', 'ethnicity',
      
      // Appearance and Physical
      'height', 'weight', 'build', 'appearance', 'skinColor', 'facialAttractiveness', 'hijab', 'beard', 'genotype',
      
      // Islamic Practice and Deen
      'patternOfSalaah', 'revert', 'startedPracticing', 'sect', 
      'scholarsSpeakers', 'dressingCovering', 'islamicPractice',
      
      // Lifestyle and Matching
      'traits', 'interests', 'openToMatches', 'dealbreakers', 'icebreakers',
      
      // Wali Details (for female users)
      'waliDetails'
    ];
    
    console.log('🔄 Processing field updates...');
    console.log('📥 Request body fields:', Object.keys(req.body));
    console.log('📥 Full request body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 Current user.hidden value:', user.hidden);
    console.log('🔍 Request body hidden value:', req.body.hidden);
    let fieldsUpdated = 0;
    let fieldsSkipped = [];
    
    const body = { ...req.body };

    // parentEmail removed from system

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
      if (w && typeof w === 'object') {
        body.waliDetails = JSON.stringify(w);
      } else if (typeof w === 'string') {
        const parsed = tryJsonParse(w);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body.waliDetails = JSON.stringify(parsed);
        } else {
          body.waliDetails = w.trim();
        }
      } else if (w == null) {
        delete body.waliDetails;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'dob')) {
      const d = new Date(body.dob);
      if (!isNaN(d)) body.dob = d; else delete body.dob;
    }

    updatableFields.forEach(field => {
      if (body[field] !== undefined) {
        const oldValue = user[field];
        user[field] = body[field];
        console.log(`✏️ Updated ${field}: "${oldValue}" → "${body[field]}"`);
        fieldsUpdated++;
      } else {
        fieldsSkipped.push(field);
      }
    });
    
    console.log(`⚠️ Fields not in request (${fieldsSkipped.length}):`, fieldsSkipped);
    
    console.log(`📝 Total fields updated: ${fieldsUpdated}`);
    console.log('💾 Saving user to database...');
    console.log('📊 User object before save (sample fields):', {
      skinColor: user.skinColor,
      facialAttractiveness: user.facialAttractiveness,
      traits: user.traits,
      interests: user.interests,
      sect: user.sect,
      dressingCovering: user.dressingCovering
    });
    
    const updatedUser = await user.save();
    console.log('✅ User saved successfully to database');
    console.log('📊 User object after save (sample fields):', {
      skinColor: updatedUser.skinColor,
      facialAttractiveness: updatedUser.facialAttractiveness,
      traits: updatedUser.traits,
      interests: updatedUser.interests,
      sect: updatedUser.sect,
      dressingCovering: updatedUser.dressingCovering
    });
    
    // Check if waliDetails was updated and send notification email
    if (req.body.waliDetails && updatedUser.waliDetails) {
      try {
        const waliData = JSON.parse(updatedUser.waliDetails);
        if (waliData.email && waliData.name) {
          console.log('📧 Sending wali notification email...');
          await sendWaliAddedNotificationEmail(waliData.email, waliData.name, `${updatedUser.fname} ${updatedUser.lname}`);
          console.log('✅ Wali notification email sent successfully');
        }
      } catch (parseError) {
        console.error('❌ Error parsing waliDetails for email notification:', parseError);
      }
    }
    
    // Check if profile was hidden and send notification email
    console.log('🔍 CHECKING PROFILE HIDDEN EMAIL TRIGGER:');
    console.log('  - req.body.hidden:', req.body.hidden);
    console.log('  - req.body.hidden !== undefined:', req.body.hidden !== undefined);
    console.log('  - req.body.hidden === true:', req.body.hidden === true);
    console.log('  - user.hidden (before update):', user.hidden);
    console.log('  - user.hidden !== true:', user.hidden !== true);
    console.log('  - All conditions met:', req.body.hidden !== undefined && req.body.hidden === true && user.hidden !== true);
    
    // Send email whenever profile is set to hidden (regardless of previous state for testing)
    if (req.body.hidden !== undefined && req.body.hidden === true) {
      try {
        console.log('🔒 PROFILE HIDDEN - Triggering email notification');
        console.log('📧 Email recipient:', updatedUser.email);
        console.log('👤 User name:', updatedUser.fname);
        console.log('📧 Sending profile hidden notification email...');
        await sendEncourageUnhideEmail(updatedUser.email, updatedUser.fname);
        console.log('✅ Profile hidden notification email sent successfully to:', updatedUser.email);
      } catch (emailError) {
        console.error('❌ Error sending profile hidden notification email:', emailError);
      }
    } else {
      console.log('❌ Profile hidden email NOT triggered - conditions not met');
    }
    
    // Clear profile cache after update
    clearProfileCache(req.params.id);
    console.log('🗑️ Profile cache cleared');
    
    // Return comprehensive user data including all updated fields
    console.log('📤 Sending response with updated user data...');
    
    const responseData = {
      _id: updatedUser._id,
      id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      
      // Basic Info
      fname: updatedUser.fname,
      lname: updatedUser.lname,
      kunya: updatedUser.kunya,
      dob: updatedUser.dob,
      maritalStatus: updatedUser.maritalStatus,
      noOfChildren: updatedUser.noOfChildren,
      summary: updatedUser.summary,
      workEducation: updatedUser.workEducation,
      profile_pic: updatedUser.profile_pic,
      hidden: updatedUser.hidden,
      
      // System fields
      plan: updatedUser.plan,
      gender: updatedUser.gender,
      
      // Location and Ethnicity
      nationality: updatedUser.nationality,
      country: updatedUser.country,
      state: updatedUser.state,
      city: updatedUser.city,
      region: updatedUser.region,
      ethnicity: updatedUser.ethnicity,
      
      // Physical Attributes
      height: updatedUser.height,
      weight: updatedUser.weight,
      build: updatedUser.build,
      appearance: updatedUser.appearance,
      skinColor: updatedUser.skinColor,
      facialAttractiveness: updatedUser.facialAttractiveness,
      hijab: updatedUser.hijab,
      beard: updatedUser.beard,
      genotype: updatedUser.genotype,
      
      // Islamic Practice and Deen
      patternOfSalaah: updatedUser.patternOfSalaah,
      revert: updatedUser.revert,
      startedPracticing: updatedUser.startedPracticing,
      sect: updatedUser.sect,
      scholarsSpeakers: updatedUser.scholarsSpeakers,
      dressingCovering: updatedUser.dressingCovering,
      islamicPractice: updatedUser.islamicPractice,
      
      // Lifestyle and Matching
      traits: updatedUser.traits,
      interests: updatedUser.interests,
      openToMatches: updatedUser.openToMatches,
      dealbreakers: updatedUser.dealbreakers,
      icebreakers: updatedUser.icebreakers,
      
      // Wali Details (for female users)
      waliDetails: updatedUser.waliDetails,
      
      // Timestamps
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt
    };
    
    res.json(responseData);
    console.log('✅ Response sent successfully');
    console.log('📊 Final response data keys:', Object.keys(responseData));
    
  } catch (error) {
    console.error('❌ Backend updateUserProfile error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get users for browsing (with filtering)
// @route   GET /api/users/browse
// @access  Private
exports.getBrowseUsers = async (req, res) => {
  try {
    console.log("Getting browse users with query:", req.query);
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Default filters - only exclude current user
    const filters = {
      _id: { $ne: req.user._id }, // Exclude current user
      hidden: { $ne: true }, // Exclude hidden profiles
      status: { $in: ['active', 'pending', 'NEW'] }, // Include active, pending, and new users, exclude banned/suspended
    };
    
    // Always filter by opposite gender with safe fallback
    const desiredGender = currentUser.gender === 'male' 
      ? 'female' 
      : currentUser.gender === 'female' 
        ? 'male' 
        : 'female';
    filters.gender = desiredGender;
    
    // Additional filters from query
    if (req.query.country) {
      filters.country = req.query.country;
    }
    
    if (req.query.nationality) {
      filters.nationality = req.query.nationality;
    }

    if (req.query.hijab === 'Yes') {
      filters.hijab = 'Yes';
    }

    if (req.query.beard === 'Yes') {
      filters.beard = 'Yes';
    }
    
    if (req.query.build) {
      filters.build = req.query.build;
    }
    
    if (req.query.appearance) {
      filters.appearance = req.query.appearance;
    }
    
    if (req.query.genotype) {
      filters.genotype = req.query.genotype;
    }
    
    if (req.query.maritalStatus) {
      filters.maritalStatus = req.query.maritalStatus;
    }
    
    if (req.query.patternOfSalaah) {
      filters.patternOfSalaah = req.query.patternOfSalaah;
    }
    
    // Age range filter
    if (req.query.minAge || req.query.maxAge) {
      const now = new Date();
      const ageFilter = {};
      
      if (req.query.maxAge) {
        const minBirthDate = new Date(now.getFullYear() - parseInt(req.query.maxAge) - 1, now.getMonth(), now.getDate());
        ageFilter.$gte = minBirthDate;
      }
      
      if (req.query.minAge) {
        const maxBirthDate = new Date(now.getFullYear() - parseInt(req.query.minAge), now.getMonth(), now.getDate());
        ageFilter.$lte = maxBirthDate;
      }
      
      if (Object.keys(ageFilter).length > 0) {
        filters.dob = ageFilter;
      }
    }
    
    // Height range filter (assuming height is stored as number in inches)
    if (req.query.minHeight || req.query.maxHeight) {
      const heightFilter = {};
      if (req.query.minHeight) heightFilter.$gte = parseInt(req.query.minHeight);
      if (req.query.maxHeight) heightFilter.$lte = parseInt(req.query.maxHeight);
      if (Object.keys(heightFilter).length > 0) {
        filters.height = heightFilter;
      }
    }
    
    // Weight range filter (assuming weight is stored as number in kg/lbs)
    if (req.query.minWeight || req.query.maxWeight) {
      const weightFilter = {};
      if (req.query.minWeight) weightFilter.$gte = parseInt(req.query.minWeight);
      if (req.query.maxWeight) weightFilter.$lte = parseInt(req.query.maxWeight);
      if (Object.keys(weightFilter).length > 0) {
        filters.weight = weightFilter;
      }
    }
    
    console.log("🔍 Applying filters:", JSON.stringify(filters, null, 2));
    
    // Allow pagination for large datasets
    const limit = req.query.limit ? parseInt(req.query.limit) : 30;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const skip = (page - 1) * limit;
    
    console.log(`📊 Pagination: page=${page}, limit=${limit}, skip=${skip}`);

    // Determine sorting based on sortBy parameter
    let sortCriteria = { lastSeen: -1, createdAt: -1 }; // Default: most recently active first, then newest
    
    if (req.query.sortBy) {
      switch (req.query.sortBy) {
        case 'newest':
          sortCriteria = { createdAt: -1 }; // Newest accounts first
          break;
        case 'oldest':
          sortCriteria = { createdAt: 1 }; // Oldest accounts first
          break;
        case 'lastSeen':
        default:
          // Sort by lastSeen first, then by createdAt for accounts without lastSeen
          sortCriteria = { lastSeen: -1, createdAt: -1 };
          break;
      }
    }
    
    console.log("📈 Applying sort criteria:", JSON.stringify(sortCriteria, null, 2));

    const count = await User.countDocuments(filters);
    console.log(`📋 Total users matching filters: ${count}`);
    
    // Use aggregation pipeline to handle sorting with null lastSeen values properly
    const users = await User.aggregate([
      { $match: filters },
      {
        $addFields: {
          // Create a computed field for sorting that handles null lastSeen
          sortField: {
            $cond: {
              if: { $eq: ["$lastSeen", null] },
              then: "$createdAt", // Use createdAt for users without lastSeen
              else: "$lastSeen"   // Use lastSeen for users who have it
            }
          }
        }
      },
      {
        $sort: req.query.sortBy === 'oldest' 
          ? { createdAt: 1 }
          : req.query.sortBy === 'newest'
          ? { createdAt: -1 }
          : { sortField: -1, createdAt: -1 } // Default: sort by sortField desc, then createdAt desc
      },
      {
        $project: {
          password: 0,
          resetPasswordToken: 0,
          resetPasswordTokenExpiration: 0,
          validationToken: 0,
          sortField: 0 // Remove the computed field from results
        }
      },
      { $skip: skip },
      { $limit: limit }
    ]);
    
    console.log(`✅ Found ${users.length} users matching the criteria on page ${page}`);
    
    // Debug: Log first few users to see what's being returned
    if (users.length > 0) {
      console.log('👥 Sample users returned:');
      users.slice(0, 3).forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.fname} ${user.lname} (${user.username}) - Status: ${user.status}, Created: ${user.createdAt}, LastSeen: ${user.lastSeen}`);
      });
    } else {
      console.log('❌ No users returned - investigating...');
      
      // Let's check if there are any users at all with basic filters
      const basicOpposite = currentUser.gender === 'male' 
        ? 'female' 
        : currentUser.gender === 'female' 
          ? 'male' 
          : 'female';
      const basicCount = await User.countDocuments({
        _id: { $ne: req.user._id },
        gender: basicOpposite
      });
      console.log(`🔍 Users with basic filters (opposite gender): ${basicCount}`);
      
      // Check users with different statuses
      const statusCounts = await User.aggregate([
        {
          $match: {
            _id: { $ne: req.user._id },
            gender: basicOpposite
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      console.log('📊 User counts by status:', statusCounts);
    }
    
    res.json({
      users,
      page,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error("Error in getBrowseUsers:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Upgrade user plan
// @route   POST /api/users/upgrade-plan
// @access  Public (called by webhook)
exports.upgradePlan = async (req, res) => {
  try {
    const { email, plan } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.plan = plan || 'premium';
    await user.save();
    
    res.json({ message: 'Plan upgraded successfully' });
  } catch (error) {
    console.error('Upgrade plan error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Debug endpoint to investigate user data
// @route   GET /api/users/debug-users
// @access  Private
exports.debugUsers = async (req, res) => {
  try {
    console.log('🔍 DEBUG: Investigating user data...');
    
    // Get total user count
    const totalUsers = await User.countDocuments({});
    console.log(`📊 Total users in database: ${totalUsers}`);
    
    // Get users by status
    const statusCounts = await User.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    console.log('📈 Users by status:', statusCounts);
    
    // Get users by gender
    const genderCounts = await User.aggregate([
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log('👥 Users by gender:', genderCounts);
    
    // Get recent users (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.find({
      createdAt: { $gte: sevenDaysAgo }
    }).select('fname lname username status createdAt gender hidden').sort({ createdAt: -1 }).limit(10);
    
    console.log('🆕 Recent users (last 7 days):');
    recentUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.fname} ${user.lname} (${user.username}) - Status: ${user.status}, Gender: ${user.gender}, Hidden: ${user.hidden}, Created: ${user.createdAt}`);
    });
    
    // Check what would match current search filters
    const currentUser = await User.findById(req.user._id);
    const searchFilters = {
      _id: { $ne: req.user._id },
      hidden: { $ne: true },
      status: { $in: ['active', 'pending', 'NEW'] },
      gender: currentUser.gender === 'male' ? 'female' : 'male'
    };
    
    const matchingUsers = await User.find(searchFilters)
      .select('fname lname username status createdAt gender hidden lastSeen')
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log('🎯 Users matching current search filters:');
    matchingUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.fname} ${user.lname} (${user.username}) - Status: ${user.status}, Created: ${user.createdAt}, LastSeen: ${user.lastSeen}`);
    });
    
    res.json({
      totalUsers,
      statusCounts,
      genderCounts,
      recentUsers: recentUsers.length,
      matchingUsers: matchingUsers.length,
      message: 'Debug data logged to console'
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
};

// @desc    Add user to favorites
// @route   POST /api/users/favorites/:userId
// @access  Private
exports.addToFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    const favoriteUserId = req.params.userId;
    
    console.log(`Adding user ${favoriteUserId} to favorites for user ${userId}`);
    
    if (userId.toString() === favoriteUserId) {
      return res.status(400).json({ message: "You cannot add yourself to favorites" });
    }
    
    // Check if user exists
    const favoriteUser = await User.findById(favoriteUserId);
    if (!favoriteUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Add to favorites if not already there
    const user = await User.findById(userId);
    if (!user.favorites) {
      user.favorites = [];
    }
    
    if (!user.favorites.includes(favoriteUserId)) {
      user.favorites.push(favoriteUserId);
      await user.save();
      console.log(`Successfully added to favorites. New favorites array:`, user.favorites);
    }
    
    res.json({ message: "User added to favorites", favorites: user.favorites });
  } catch (error) {
    console.error("Add to favorites error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Remove user from favorites
// @route   DELETE /api/users/favorites/:userId
// @access  Private
exports.removeFromFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    const favoriteUserId = req.params.userId;
    
    console.log(`Removing user ${favoriteUserId} from favorites for user ${userId}`);
    
    const user = await User.findById(userId);
    if (!user.favorites) {
      user.favorites = [];
    }
    
    user.favorites = user.favorites.filter(id => id.toString() !== favoriteUserId);
    await user.save();
    
    console.log(`Successfully removed from favorites. New favorites array:`, user.favorites);
    
    res.json({ message: "User removed from favorites", favorites: user.favorites });
  } catch (error) {
    console.error("Remove from favorites error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get user's favorites
// @route   GET /api/users/favorites
// @access  Private
// @desc    Get profile views count
// @route   GET /api/users/profile-views-count
// @access  Private
exports.getProfileViewsCount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ profileViews: user.profileViews || 0 });
  } catch (error) {
    console.error('Get profile views count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log(`Getting favorites for user ${userId}`);
    
    const user = await User.findById(userId).populate('favorites', '-password');
    
    console.log(`Found ${user.favorites?.length || 0} favorites`);
    
    res.json({ favorites: user.favorites || [] });
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Search users with advanced filtering (taofeeq_UI compatible)
// @route   GET /api/users/search
// @access  Private
exports.searchUsers = async (req, res) => {
  try {
    const {
      nationality,
      country,
      ageRange,
      heightRange,
      weightRange,
      build,
      appearance,
      maritalStatus,
      patternOfSalaah,
      genotype,
      sortBy = 'lastSeen',
      page = 1,
      limit = 20
    } = req.query;

    const currentUser = req.user;
    
    // Get existing relationships to exclude from search
    const Relationship = require('../models/Relationship');
    const existingRelationships = await Relationship.find({
      $or: [
        { requester: currentUser._id },
        { recipient: currentUser._id }
      ],
      status: { $in: ['pending', 'accepted'] }
    }).select('requester recipient');
    
    // Extract user IDs to exclude (existing matches/pending requests)
    const excludeUserIds = existingRelationships.map(rel => 
      rel.requester.toString() === currentUser._id.toString() 
        ? rel.recipient 
        : rel.requester
    );
    
    const query = {
      _id: { 
        $ne: currentUser._id,
        $nin: excludeUserIds // Exclude existing matches and pending requests
      },
      emailVerified: true,
      hidden: { $ne: true }
    };

    // Gender filtering - show opposite gender
    if (currentUser.gender) {
      query.gender = currentUser.gender === 'male' ? 'female' : 'male';
    }

    // Apply filters
    if (nationality && nationality !== '') {
      query.nationality = new RegExp(nationality, 'i');
    }

    if (country && country !== '') {
      query.country = new RegExp(country, 'i');
    }

    if (build && build !== '') {
      query.build = new RegExp(build, 'i');
    }

    if (appearance && appearance !== '') {
      query.appearance = new RegExp(appearance, 'i');
    }

    if (maritalStatus && maritalStatus !== '') {
      query.maritalStatus = new RegExp(maritalStatus, 'i');
    }

    if (patternOfSalaah && patternOfSalaah !== '') {
      query.patternOfSalaah = new RegExp(patternOfSalaah, 'i');
    }

    if (genotype && genotype !== '') {
      query.genotype = new RegExp(genotype, 'i');
    }

    // Age range filtering
    if (ageRange && Array.isArray(ageRange) && ageRange.length === 2) {
      const [minAge, maxAge] = ageRange.map(Number);
      const maxDate = new Date();
      const minDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() - minAge);
      minDate.setFullYear(minDate.getFullYear() - maxAge);
      
      query.dob = {
        $gte: minDate,
        $lte: maxDate
      };
    }

    // Height range filtering (assuming height is stored in inches)
    if (heightRange && Array.isArray(heightRange) && heightRange.length === 2) {
      const [minHeight, maxHeight] = heightRange.map(Number);
      query.height = {
        $gte: minHeight,
        $lte: maxHeight
      };
    }

    // Weight range filtering
    if (weightRange && Array.isArray(weightRange) && weightRange.length === 2) {
      const [minWeight, maxWeight] = weightRange.map(Number);
      query.weight = {
        $gte: minWeight,
        $lte: maxWeight
      };
    }

    // Sorting
    let sortOptions = {};
    switch (sortBy) {
      case 'lastSeen':
        sortOptions = { lastSeen: -1, createdAt: -1 };
        break;
      case 'created':
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { lastSeen: -1, createdAt: -1 };
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const users = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordTokenExpiration -validationToken -email -phoneNumber -waliDetails -favorites -blockedUsers -reportedUsers')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limitNum);

    // Update last seen for current user
    await User.findByIdAndUpdate(currentUser._id, { lastSeen: new Date() });

    res.json({
      returnData: users,
      currentPage: pageNum,
      totalPages,
      totalUsers,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Log profile view
// @route   POST /api/users/log-profile-view
// @access  Private
exports.logProfileView = async (req, res) => {
  try {
    const { userId } = req.body;
    const viewerId = req.user._id.toString();
    
    // Don't log if user is viewing their own profile
    if (userId === viewerId) {
      return res.status(200).json({ message: 'Own profile view not logged' });
    }
    
    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if this viewer has already viewed this profile recently (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingView = await UserActivityLog.findOne({
      userId: viewerId,
      receiverId: userId,
      action: 'PROFILE_VIEW',
      createdAt: { $gte: oneHourAgo }
    });
    
    // Only log and increment if no recent view exists
    if (!existingView) {
      // Log the profile view activity
      await UserActivityLog.create({
        userId: viewerId,
        receiverId: userId,
        action: 'PROFILE_VIEW',
      });
      
      // Increment the profile views count on the target user
      const updatedUser = await User.findByIdAndUpdate(userId, {
        $inc: { profileViews: 1 }
      }, { new: true });
      
      console.log(`Profile view logged: ${viewerId} viewed ${userId}`);
      
      // Send profile view notification email if user has reached milestone view counts
      const viewCount = updatedUser.profileViews;
      if (viewCount && (viewCount === 5 || viewCount === 10 || viewCount % 25 === 0)) {
        try {
          await sendProfileViewEmail(targetUser.email, targetUser.fname, viewCount);
          console.log(`Profile view milestone email sent to ${targetUser.email} for ${viewCount} views`);
        } catch (emailError) {
          console.error('Error sending profile view email:', emailError);
        }
      }
    }
    
    res.status(200).json({ message: 'Profile view logged successfully' });
  } catch (error) {
    console.error('Log profile view error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete user account
// @route   DELETE /api/users/account
// @access  Private
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log(`Deleting account for user ${userId}`);
    
    // Start a transaction to ensure all related data is deleted
    const session = await User.startSession();
    session.startTransaction();
    
    try {
      // Import required models
      const Relationship = require('../models/Relationship');
      const Chat = require('../models/Chat');
      const Conversation = require('../models/Conversation');
      const Message = require('../models/Message');
      const Notification = require('../models/Notification');
      const Payment = require('../models/Payment');
      const Subscription = require('../models/Subscription');
      const UserActivityLog = require('../models/UserActivityLog');
      const VideoCallTime = require('../models/VideoCallTime');
      const MonthlyCallUsage = require('../models/MonthlyCallUsage');
      const Call = require('../models/Call');
      const WaliChat = require('../models/WaliChat');
      const Report = require('../models/Report');
      const ScheduledEmail = require('../models/ScheduledEmail');
      const PushNotification = require('../models/PushNotification');

      // Normalize id for string-based schemas
      const userIdStr = userId.toString();

      // Delete all related data (match actual schema fields)
      await Relationship.deleteMany(
        { $or: [{ follower_user_id: userIdStr }, { followed_user_id: userIdStr }] },
        { session }
      );

      await Chat.deleteMany(
        { $or: [{ senderId: userId }, { receiverId: userId }] },
        { session }
      );

      await Conversation.deleteMany({ participants: userId }, { session });

      await Message.deleteMany(
        { $or: [{ sender: userId }, { receiver: userId }] },
        { session }
      );

      await Notification.deleteMany(
        { $or: [
          { user: userId },
          { 'data.callerId': userId },
          { 'data.recipientId': userId },
          { 'data.matchId': userId }
        ] },
        { session }
      );

      await Payment.deleteMany({ user: userId }, { session });
      await Subscription.deleteMany({ user: userId }, { session });
      await UserActivityLog.deleteMany({ user: userId }, { session });

      await VideoCallTime.deleteMany(
        { $or: [{ user1: userId }, { user2: userId }] },
        { session }
      );

      await MonthlyCallUsage.deleteMany(
        { $or: [{ user1: userId }, { user2: userId }] },
        { session }
      );

      await Call.deleteMany(
        { $or: [{ caller: userId }, { recipient: userId }, { 'participants.userId': userId }] },
        { session }
      );

      await WaliChat.deleteMany(
        { $or: [{ wardid: userId }, { wardcontactid: userId }] },
        { session }
      );

      await Report.deleteMany(
        { $or: [{ reporter: userId }, { reported: userId }, { reviewedBy: userId }] },
        { session }
      );

      // Remove user from recipients/targets arrays
      await ScheduledEmail.updateMany({}, { $pull: { recipients: userId } }, { session });
      await PushNotification.updateMany({}, { $pull: { targetUsers: userId } }, { session });
      await PushNotification.deleteMany({ createdBy: userId }, { session });

      // Remove this user from other users' favorites arrays
      await User.updateMany({}, { $pull: { favorites: userId } }, { session });

      // Finally, delete the user account
      await User.deleteOne({ _id: userId }, { session });
      
      // Commit the transaction
      await session.commitTransaction();
      
      console.log(`Successfully deleted account for user ${userId}`);
      
      res.json({ message: 'Account and all associated data have been successfully deleted.' });
    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
