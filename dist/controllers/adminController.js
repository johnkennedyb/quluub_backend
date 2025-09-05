const mongoose = require('mongoose');
const User = require('../models/User');
const Call = require('../models/Call');
const PushNotification = require('../models/PushNotification');
const Chat = require('../models/Chat');
const Payment = require('../models/Payment');
const Report = require('../models/Report');
const Relationship = require('../models/Relationship');
const Subscription = require('../models/Subscription');
const ScheduledEmail = require('../models/ScheduledEmail');
const Notification = require('../models/Notification');
const UserActivityLog = require('../models/UserActivityLog');
const WaliChat = require('../models/WaliChat');
const crypto = require('crypto');
const { sendBulkEmail: sendBulkEmailService, sendTestEmailService, updateEmailConfig, getEmailConfigService, getEmailMetricsService } = require('../utils/emailService');
const { sendPushNotification: sendPushNotificationService } = require('../utils/pushNotificationService');

// @desc    Get admin stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    console.log('Date ranges for inactivity:');
    console.log('oneMonthAgo:', oneMonthAgo);
    console.log('threeMonthsAgo:', threeMonthsAgo);
    console.log('sixMonthsAgo:', sixMonthsAgo);
    console.log('oneYearAgo:', oneYearAgo);

    // User Stats
    const totalMembers = await User.countDocuments();
    const maleMembers = await User.countDocuments({ gender: 'male' });
    const femaleMembers = await User.countDocuments({ gender: 'female' });
    const premiumMembers = await User.countDocuments({ plan: 'premium' });
    const proMembers = await User.countDocuments({ plan: 'pro' });
    const hiddenProfiles = await User.countDocuments({ hidden: true });
    const recentRegistrations = await User.countDocuments({ createdAt: { $gte: oneWeekAgo } });
    const monthlyRegistrations = await User.countDocuments({ createdAt: { $gte: oneMonthAgo } });

    // Activity Stats
    const activeToday = await User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    const activeThisWeek = await User.countDocuments({ lastSeen: { $gte: oneWeekAgo } });
    const activeThisMonth = await User.countDocuments({ lastSeen: { $gte: oneMonthAgo } });

    // Inactivity Stats - Handle users with null/undefined lastSeen
    const inactiveUsers = await User.countDocuments({
      $or: [
        { lastSeen: { $lt: oneMonthAgo } },
        { lastSeen: { $exists: false } },
        { lastSeen: null }
      ]
    });
    const inactiveQuarter = await User.countDocuments({
        lastSeen: { $lt: threeMonthsAgo }
    });
    const inactiveSixMonths = await User.countDocuments({
        lastSeen: { $lt: sixMonthsAgo }
    });
    const inactiveYear = await User.countDocuments({
        lastSeen: { $lt: oneYearAgo }
    });

    console.log('Inactive user counts:');
    console.log('inactiveUsers (1 month):', inactiveUsers);
    console.log('inactiveQuarter (3 months):', inactiveQuarter);
    console.log('inactiveSixMonths (6 months):', inactiveSixMonths);
    console.log('inactiveYear (1 year):', inactiveYear);

    // Match Stats
    const totalMatches = await Relationship.countDocuments({ status: 'matched' });
    const pendingRequests = await Relationship.countDocuments({ status: 'pending' });
    const rejectedRequests = await Relationship.countDocuments({ status: 'rejected' });
    const successRate = totalMatches > 0 ? (totalMatches / (totalMatches + rejectedRequests)) * 100 : 0;
    const avgMatchesPerUser = totalMembers > 0 ? totalMatches / totalMembers : 0;

    // Communication Stats
    const messagesExchanged = await Chat.countDocuments();
    const messagesThisWeek = await Chat.countDocuments({ createdAt: { $gte: oneWeekAgo } });
    const messagesThisMonth = await Chat.countDocuments({ createdAt: { $gte: oneMonthAgo } });
    const matchToChatRate = totalMatches > 0 ? (await Chat.distinct('conversationId')).length / totalMatches * 100 : 0;

    // Financial & Growth Stats
    const totalSubscriptions = premiumMembers + proMembers; // Use actual premium/pro counts instead of Subscription model
    const conversionRate = totalMembers > 0 ? (totalSubscriptions / totalMembers) * 100 : 0;
    const freeToProConversions = await User.countDocuments({ 
      plan: { $in: ['premium', 'pro'] }, 
      premiumExpirationDate: { $gte: oneMonthAgo } // Users who became premium in last month
    });

    const membersAtStartOfMonth = await User.countDocuments({ createdAt: { $lt: oneMonthAgo } });
    
    // Fix churn rate calculation - users who were active but haven't been seen recently
    const churnedUsersLastMonth = await User.countDocuments({
      createdAt: { $lt: oneMonthAgo }, // Existing users from before this month
      $or: [
        { lastSeen: { $lt: oneMonthAgo } }, // Haven't been active in the last month
        { lastSeen: { $exists: false } },
        { lastSeen: null }
      ]
    });
    
    // Fix growth rate calculation with better logic
    const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: oneMonthAgo } });
    const growthRate = membersAtStartOfMonth > 0 ? (newUsersThisMonth / membersAtStartOfMonth) * 100 : 0;
    
    // Limit growth rate to reasonable maximum (e.g., 1000%)
    const cappedGrowthRate = Math.min(growthRate, 1000);
    
    const churnRate = membersAtStartOfMonth > 0 ? (churnedUsersLastMonth / membersAtStartOfMonth) * 100 : 0;

    // Fix engagement rate - use monthly active users instead of weekly for better metric
    const engagementRate = totalMembers > 0 ? (activeThisMonth / totalMembers) * 100 : 0;

    const geographicDistribution = await User.aggregate([
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { country: '$_id', count: '$count' } },
    ]);
    const topReferrers = await User.aggregate([
      { $match: { referredBy: { $exists: true } } },
      { $group: { _id: '$referredBy', totalReferrals: { $sum: 1 } } },
      { $sort: { totalReferrals: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'referrerInfo' } },
      { $unwind: '$referrerInfo' },
      { $project: { _id: 0, fname: '$referrerInfo.fname', lname: '$referrerInfo.lname', username: '$referrerInfo.username', totalReferrals: '$totalReferrals' } },
    ]);

    // Calculate additional metrics
    const totalReferrals = await User.countDocuments({ referredBy: { $exists: true } });
    const activeReferrals = await User.countDocuments({ referredBy: { $exists: true }, status: 'active' });
    
    // Age distribution - Simplified approach to avoid type issues
    let ageDistribution = [];
    try {
      ageDistribution = await User.aggregate([
        { $match: { dob: { $exists: true, $ne: null, $type: 'date' } } },
        { 
          $addFields: { 
            age: { 
              $floor: { 
                $divide: [
                  { $subtract: [new Date(), '$dob'] }, 
                  31557600000
                ] 
              } 
            } 
          } 
        },
        { $match: { age: { $gte: 18, $lte: 100 } } },
        { $group: { _id: '$age', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $limit: 20 }
      ]);
    } catch (err) {
      console.error('Age distribution aggregation error:', err);
      ageDistribution = [];
    }

    const statsData = {
      totalMembers, maleMembers, femaleMembers, premiumMembers, proMembers, hiddenProfiles, 
      recentRegistrations, monthlyRegistrations,
      activeToday, activeThisWeek, activeThisMonth,
      inactiveUsers, inactiveQuarter, inactiveSixMonths, inactiveYear,
      totalMatches, pendingRequests, rejectedRequests, 
      successRate: parseFloat(successRate.toFixed(2)), 
      avgMatchesPerUser: parseFloat(avgMatchesPerUser.toFixed(2)),
      messagesExchanged, messagesThisWeek, messagesThisMonth, 
      matchToChatRate: parseFloat(matchToChatRate.toFixed(2)),
      conversionRate: parseFloat(conversionRate.toFixed(2)), 
      freeToProConversions, 
      churnRate: parseFloat(churnRate.toFixed(2)), 
      growthRate: parseFloat(cappedGrowthRate.toFixed(2)), 
      engagementRate: parseFloat(engagementRate.toFixed(2)),
      totalReferrals, activeReferrals,
      geographicDistribution, topReferrers, ageDistribution
    };

    console.log('Admin Stats Generated:', {
      totalMembers,
      hiddenProfiles,
      inactiveUsers,
      activeToday,
      activeThisWeek
    });

    res.json(statsData);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user details by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Get user's matches from Relationship model
    const matches = await Relationship.find({
      $or: [
        { requester: id, status: 'matched' },
        { recipient: id, status: 'matched' }
      ]
    }).populate('requester', 'fname lname username profilePicture')
      .populate('recipient', 'fname lname username profilePicture');
    
    // Get user's conversations from Chat model
    const conversations = await Chat.find({
      $or: [
        { sender: id },
        { receiver: id }
      ]
    }).distinct('conversationId');
    
    const userStats = {
      totalMatches: matches?.length || 0,
      totalConversations: conversations?.length || 0,
      profileViews: user.profileViews || 0,
      lastActive: user.lastSeen || user.updatedAt
    };
    
    res.json({ ...user.toObject(), stats: userStats });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      gender,
      plan,
      status,
      country,
      city,
      inactiveFor
    } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { fname: { $regex: search, $options: 'i' } },
        { lname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    if (gender && gender !== 'all') query.gender = gender;
    if (plan && plan !== 'all') query.plan = plan;
    if (status && status !== 'all') query.status = status;
    if (country) query.country = { $regex: country, $options: 'i' };
    if (city) query.city = { $regex: city, $options: 'i' };

    if (inactiveFor && inactiveFor !== 'all') {
      const days = parseInt(inactiveFor, 10);
      if (!isNaN(days)) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        query.$or = [
          { lastSeen: { $lt: date } },
          { lastSeen: { $exists: false } },
          { lastSeen: null }
        ];
      }
    }

    // Add hidden profile filtering
    if (req.query.hidden === 'true') {
      query.hidden = true;
    } else if (req.query.hidden === 'false') {
      query.hidden = { $ne: true };
    }

    const totalUsers = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    console.log(`Fetching ${users.length} users for admin dashboard`);
    
    // Calculate lastSeenAgo, matchCount, and messageCount for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const userObj = user.toObject();
      
      // Calculate lastSeenAgo
      if (userObj.lastSeen) {
        const now = new Date();
        const lastSeenDate = new Date(userObj.lastSeen);
        const diffTime = Math.abs(now.getTime() - lastSeenDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        userObj.lastSeenAgo = diffDays;
      } else {
        userObj.lastSeenAgo = null;
      }
      
      try {
        // Calculate match count from Relationship model
        const matchCount = await Relationship.countDocuments({
          $or: [
            { follower_user_id: user._id.toString(), status: 'matched' },
            { followed_user_id: user._id.toString(), status: 'matched' }
          ]
        });
        
        // Calculate message count from Chat model
        const messageCount = await Chat.countDocuments({
          $or: [
            { senderId: user._id },
            { receiverId: user._id }
          ]
        });
        
        userObj.matchCount = matchCount;
        userObj.messageCount = messageCount;
        
        if (matchCount > 0 || messageCount > 0) {
          console.log(`User ${user.fname} ${user.lname}: ${matchCount} matches, ${messageCount} messages`);
        }
      } catch (error) {
        console.error(`Error calculating stats for user ${user._id}:`, error);
        userObj.matchCount = 0;
        userObj.messageCount = 0;
      }
      
      return userObj;
    }));

    res.json({
      users: usersWithStats,
      pagination: {
        total: totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        hasNextPage: parseInt(page) * parseInt(limit) < totalUsers,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    console.log('Admin updateUser called with ID:', req.params.id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const user = await User.findById(req.params.id);
    if (user) {
      console.log('User found:', user.email);
      
      // Update fields safely
      if (req.body.fname !== undefined) user.fname = req.body.fname;
      if (req.body.lname !== undefined) user.lname = req.body.lname;
      if (req.body.email !== undefined) user.email = req.body.email;
      if (req.body.plan !== undefined) user.plan = req.body.plan;
      if (req.body.status !== undefined) user.status = req.body.status;
      if (req.body.emailVerified !== undefined) user.emailVerified = req.body.emailVerified;
      if (req.body.isVerified !== undefined) user.emailVerified = req.body.isVerified;
      if (req.body.city !== undefined) user.city = req.body.city;
      if (req.body.country !== undefined) user.country = req.body.country;
      if (req.body.gender !== undefined) user.gender = req.body.gender;
      if (req.body.dob !== undefined) {
        // Handle date properly - ensure it's a valid date
        const dobDate = new Date(req.body.dob);
        if (!isNaN(dobDate.getTime())) {
          user.dob = dobDate;
        }
      }
      
      console.log('About to save user with updates:', {
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        plan: user.plan,
        status: user.status,
        emailVerified: user.emailVerified
      });
      
      const updatedUser = await user.save();
      console.log('User updated successfully');
      res.json(updatedUser);
    } else {
      console.log('User not found with ID:', req.params.id);
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error in updateUser:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.errors) {
      console.error('Validation errors:', error.errors);
    }
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: error.errors || 'No additional details'
    });
  }
};

// @desc    Update user account status
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
const updateUserAccountStatus = async (req, res) => {
  try {
    const { status, reportId } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = status || user.status;
    const updatedUser = await user.save();

    if (reportId) {
      const report = await Report.findById(reportId);
      if (report) {
        report.status = 'action_taken';
        await report.save();
      }
    }

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update user plan
// @route   PUT /api/admin/users/:id/plan
// @access  Private/Admin
const updateUserPlan = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      if (req.body.plan !== undefined) {
        user.plan = req.body.plan;
      }
      const updatedUser = await user.save();
      res.json(updatedUser);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    await Relationship.deleteMany({ $or: [{ user1: userId }, { user2: userId }] }, { session });
    await Chat.deleteMany({ participants: userId }, { session });
    await Notification.deleteMany({ recipient: userId }, { session });
    await Payment.deleteMany({ user: userId }, { session });
    await Subscription.deleteMany({ user: userId }, { session });
    await UserActivityLog.deleteMany({ user: userId }, { session });
    await WaliChat.deleteMany({ participants: userId }, { session });
    await PushNotification.deleteMany({ recipient: userId }, { session });

    await User.updateMany({}, { $pull: { blockedUsers: userId, favoriteUsers: userId, viewedBy: userId } }, { session });

    await User.deleteOne({ _id: userId }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'User and all associated data have been successfully deleted.' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error during user deletion:', error);
    res.status(500).json({ message: 'Server error during user deletion process.' });
  }
};

// @desc    Manually verify user email
// @route   POST /api/admin/users/:id/verify-email
// @access  Private/Admin
const verifyUserEmail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.emailVerified = true;
      await user.save();
      res.json({ message: 'User email verified successfully.' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Send password reset link to user
// @route   POST /api/admin/users/:id/reset-password
// @access  Private/Admin
const sendPasswordResetLink = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      const resetToken = user.getResetPasswordToken();
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
      const message = `You are receiving this email because you (or an administrator) have requested the reset of the password for your account.\n\nPlease click on the following link, or paste it into your browser to complete the process within one hour of receiving it:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n`;

      try {
        await sendBulkEmailService([user], 'Password Reset Request', message);
        res.json({ message: 'Password reset link sent to user.' });
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(500).json({ message: 'Error sending password reset email.' });
      }
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all calls for admin dashboard
// @route   GET /api/admin/calls
// @access  Private/Admin
const getAllCalls = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      dateFrom,
      dateTo
    } = req.query;

    console.log(`Admin getAllCalls called with query:`, req.query);

    let query = {};

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const totalCalls = await Call.countDocuments(query);
    const calls = await Call.find(query)
      .populate({
        path: 'caller',
        select: 'fname lname username email profilePicture',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'recipient', 
        select: 'fname lname username email profilePicture',
        options: { strictPopulate: false }
      })
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    console.log(`Found ${calls.length} calls matching the query`);

    // Process calls to handle missing user references
    const processedCalls = calls.map(call => {
      const callObj = call.toObject();
      
      // Handle missing caller
      if (!callObj.caller) {
        console.log(`Call ${callObj._id} has missing caller with ID: ${callObj.caller}`);
        callObj.caller = {
          _id: callObj.caller,
          fname: 'Deleted',
          lname: 'User',
          username: '@deleted',
          email: 'deleted@user.com',
          profilePicture: ''
        };
      }
      
      // Handle missing recipient
      if (!callObj.recipient) {
        console.log(`Call ${callObj._id} has missing recipient with ID: ${callObj.recipient}`);
        callObj.recipient = {
          _id: callObj.recipient,
          fname: 'Deleted',
          lname: 'User', 
          username: '@deleted',
          email: 'deleted@user.com',
          profilePicture: ''
        };
      }
      
      return callObj;
    });

    // If search is provided, filter processed results
    let filteredCalls = processedCalls;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredCalls = processedCalls.filter(call => 
        call.caller?.fname?.toLowerCase().includes(searchLower) ||
        call.caller?.lname?.toLowerCase().includes(searchLower) ||
        call.caller?.username?.toLowerCase().includes(searchLower) ||
        call.caller?.email?.toLowerCase().includes(searchLower) ||
        call.recipient?.fname?.toLowerCase().includes(searchLower) ||
        call.recipient?.lname?.toLowerCase().includes(searchLower) ||
        call.recipient?.username?.toLowerCase().includes(searchLower) ||
        call.recipient?.email?.toLowerCase().includes(searchLower) ||
        call.roomId?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      calls: filteredCalls,
      pagination: {
        total: totalCalls,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCalls / limit),
        hasNextPage: parseInt(page) * parseInt(limit) < totalCalls,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Save call record
// @route   POST /api/admin/calls
// @access  Private/Admin
const saveCallRecord = async (req, res) => {
  try {
    const {
      caller,
      recipient,
      roomId,
      status,
      startedAt,
      endedAt,
      duration,
      quality
    } = req.body;

    const newCall = new Call({
      caller,
      recipient,
      roomId,
      status,
      startedAt,
      endedAt,
      duration,
      quality
    });

    await newCall.save();
    
    const savedCall = await Call.findById(newCall._id)
      .populate('caller', 'fname lname username email')
      .populate('recipient', 'fname lname username email');

    res.status(201).json({
      message: 'Call record saved successfully',
      call: savedCall
    });
  } catch (error) {
    console.error('Error saving call record:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get reported profiles for admin dashboard
// @route   GET /api/admin/reported-profiles
// @access  Private/Admin
const getReportedProfiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      dateFrom,
      dateTo
    } = req.query;

    let query = {};

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const totalReports = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate('reporter', 'fname lname username email profilePicture')
      .populate('reported', 'fname lname username email profilePicture status')
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    // If search is provided, filter populated results
    let filteredReports = reports;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredReports = reports.filter(report => 
        report.reporter?.fname?.toLowerCase().includes(searchLower) ||
        report.reporter?.lname?.toLowerCase().includes(searchLower) ||
        report.reporter?.username?.toLowerCase().includes(searchLower) ||
        report.reporter?.email?.toLowerCase().includes(searchLower) ||
        report.reported?.fname?.toLowerCase().includes(searchLower) ||
        report.reported?.lname?.toLowerCase().includes(searchLower) ||
        report.reported?.username?.toLowerCase().includes(searchLower) ||
        report.reported?.email?.toLowerCase().includes(searchLower) ||
        report.reason?.toLowerCase().includes(searchLower) ||
        report.description?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      reports: filteredReports,
      pagination: {
        total: totalReports,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / limit),
        hasNextPage: parseInt(page) * parseInt(limit) < totalReports,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching reported profiles:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Dismiss a report
// @route   PUT /api/admin/reports/:id/dismiss
// @access  Private/Admin
const dismissReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    report.status = 'dismissed';
    await report.save();
    res.json({ message: 'Report dismissed successfully' });
  } catch (error) {
    console.error('Error dismissing report:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// @desc    Send bulk email
// @route   POST /api/admin/bulk-email
// @access  Private/Admin
const handleSendBulkEmail = async (req, res) => {
  try {
    const { userIds, subject, message, sendToAll } = req.body;
    let users = [];

    if (sendToAll === 'true') {
      users = await User.find({});
    } else {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'Please select at least one user.' });
      }
      users = await User.find({ '_id': { $in: userIds } });
    }

    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found to send email to.' });
    }

    let attachments = [];
    if (req.files) {
      attachments = req.files.map(file => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype,
      }));
    }

    await sendBulkEmailService(users, subject, message, attachments);
    res.json({ message: `Bulk email sent successfully to ${users.length} users.` });
  } catch (error) {
    console.error('Error sending bulk email:', error);
    res.status(500).json({ message: 'Failed to send bulk email.' });
  }
};

// @desc    Send test email
// @route   POST /api/admin/test-email
// @access  Private/Admin
const sendTestEmail = async (req, res) => {
  try {
    const { email } = req.body;
    await sendTestEmailService(email);
    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get email metrics
// @route   GET /api/admin/email-metrics
// @access  Private/Admin
const getEmailMetrics = async (req, res) => {
  try {
    const metrics = await getEmailMetricsService();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Save email config
// @route   POST /api/admin/email-config
// @access  Private/Admin
const saveEmailConfig = async (req, res) => {
  try {
    await updateEmailConfig(req.body);
    res.json({ message: 'Email config updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get email config
// @route   GET /api/admin/email-config
// @access  Private/Admin
const sendPushNotification = async (req, res) => {
  try {
    const { title, message, target } = req.body;
    // In a real app, you would have a service to send push notifications
    console.log(`Sending push notification: ${title} - ${message} to ${target}`);
    res.json({ message: 'Push notification sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getEmailConfig = async (req, res) => {
  try {
    const config = await getEmailConfigService();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Removed duplicate function declarations - keeping the comprehensive implementations below

// @desc    Send push notification
// @route   POST /api/admin/push-notifications
// @access  Private/Admin
const sendAdminPushNotification = async (req, res) => {
  const { title, message, target, targetUsers } = req.body;

  try {
    let query = {};

    switch (target) {
      case 'all':
        query = {};
        break;
      case 'premium':
        query = { plan: 'premium' };
        break;
      case 'free':
        query = { plan: 'freemium' };
        break;
      case 'specific':
        if (!targetUsers || !Array.isArray(targetUsers) || targetUsers.length === 0) {
          return res.status(400).json({ message: 'Please select at least one user.' });
        }
        query = { _id: { $in: targetUsers } };
        break;
      default:
        return res.status(400).json({ message: 'Invalid target specified.' });
    }

    const usersToNotify = await User.find(query).select('_id pushToken');

    if (usersToNotify.length === 0){
      return res.status(404).json({ message: 'No users found for the selected target.' });
    }

    // Create in-app notifications for all targeted users
    const inAppNotifications = usersToNotify.map(user => ({
      user: user._id,
      type: 'admin_announcement',
      message: `${title}: ${message}`,
      relatedId: 'admin',
      read: false,
      createdAt: new Date()
    }));

    await Notification.insertMany(inAppNotifications);

    // Send push notifications to users with push tokens
    const usersWithTokens = usersToNotify.filter(user => user.pushToken);
    const tokens = usersWithTokens.map(user => user.pushToken);

    if (tokens.length > 0) {
      console.log(`Simulating sending push notification to ${tokens.length} tokens.`);
      // Here you would integrate with your push notification service
      // await sendPushNotificationService(tokens, title, message);
    }

    // Save push notification record
    const newNotification = new PushNotification({
      title,
      message,
      target,
      sentTo: usersToNotify.length,
      sentAt: new Date(),
    });

    await newNotification.save();

    res.json({ 
      message: `Notification sent to ${usersToNotify.length} users (${tokens.length} push notifications, ${inAppNotifications.length} in-app alerts).`,
      stats: {
        totalUsers: usersToNotify.length,
        pushNotifications: tokens.length,
        inAppNotifications: inAppNotifications.length
      }
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: 'Failed to send notification.' });
  }
};

// @desc    Get admin push notifications history
// @route   GET /api/admin/push-notifications
// @access  Private/Admin
const getAdminPushNotifications = async (req, res) => {
  try {
    const notifications = await PushNotification.find().sort({ sentAt: -1 });
    res.json({ notifications });
  } catch (error) {
    console.error('Error fetching push notifications history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get premium users for admin dashboard
// @route   GET /api/admin/premium-users
// @access  Private/Admin
const getPremiumUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      plan = 'premium'
    } = req.query;

    let query = {
      plan: { $in: ['premium', 'pro'] }
    };

    // If specific plan is requested
    if (plan && plan !== 'all') {
      query.plan = plan;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { fname: { $regex: search, $options: 'i' } },
        { lname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const totalUsers = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    // Add additional stats and payment info for each premium user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const userObj = user.toObject();
      
      try {
        // Calculate match count
        const matchCount = await Relationship.countDocuments({
          $or: [
            { follower_user_id: user._id.toString(), status: 'matched' },
            { followed_user_id: user._id.toString(), status: 'matched' }
          ]
        });
        
        // Calculate message count
        const messageCount = await Chat.countDocuments({
          $or: [
            { senderId: user._id },
            { receiverId: user._id }
          ]
        });
        
        // Get payment information
        const latestPayment = await Payment.findOne({ user: user._id })
          .sort({ createdAt: -1 })
          .select('amount currency status transactionId createdAt plan provider');
        
        userObj.matchCount = matchCount;
        userObj.messageCount = messageCount;
        userObj.fullName = `${user.fname} ${user.lname}`;
        
        // Add payment details
        if (latestPayment) {
          userObj.paymentInfo = {
            amount: latestPayment.amount,
            currency: latestPayment.currency || 'USD',
            status: latestPayment.status,
            transactionId: latestPayment.transactionId,
            paymentDate: latestPayment.createdAt,
            plan: latestPayment.plan,
            provider: latestPayment.provider || 'Unknown'
          };
        } else {
          userObj.paymentInfo = {
            amount: 0,
            currency: 'USD',
            status: 'no_payment',
            transactionId: 'N/A',
            paymentDate: null,
            plan: user.plan,
            provider: 'N/A'
          };
        }
        
        // Calculate days since subscription
        if (user.createdAt) {
          const now = new Date();
          const createdDate = new Date(user.createdAt);
          const diffTime = Math.abs(now.getTime() - createdDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          userObj.daysSinceSubscription = diffDays;
        }
        
      } catch (error) {
        console.error(`Error calculating stats for premium user ${user._id}:`, error);
        userObj.matchCount = 0;
        userObj.messageCount = 0;
        userObj.daysSinceSubscription = 0;
      }
      
      return userObj;
    }));

    res.json({
      users: usersWithStats,
      pagination: {
        total: totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        hasNextPage: parseInt(page) * parseInt(limit) < totalUsers,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching premium users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get payment history for admin dashboard
// @route   GET /api/admin/payments
// @access  Private/Admin
const getPaymentHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      dateFrom,
      dateTo,
      plan
    } = req.query;

    console.log('Getting payment history with query:', req.query);

    // Import Payment model
    const Payment = require('../models/Payment');

    let query = {};

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by plan
    if (plan && plan !== 'all') {
      query.plan = plan;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    console.log('Payment query:', query);

    const totalPayments = await Payment.countDocuments(query);
    console.log('Total payments found:', totalPayments);

    const payments = await Payment.find(query)
      .populate({
        path: 'user',
        select: 'fname lname username email',
        options: { strictPopulate: false }
      })
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    console.log('Payments retrieved:', payments.length);

    // Process payments to handle missing user references
    const processedPayments = payments.map(payment => {
      const paymentObj = payment.toObject();
      
      // Handle missing user
      if (!paymentObj.user) {
        console.log(`Payment ${paymentObj._id} has missing user with ID: ${paymentObj.user}`);
        paymentObj.user = {
          _id: paymentObj.user,
          fname: 'Deleted',
          lname: 'User',
          username: '@deleted',
          email: 'deleted@user.com'
        };
      }
      
      return paymentObj;
    });

    // If search is provided, filter processed results
    let filteredPayments = processedPayments;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPayments = processedPayments.filter(payment => 
        payment.user?.fname?.toLowerCase().includes(searchLower) ||
        payment.user?.lname?.toLowerCase().includes(searchLower) ||
        payment.user?.username?.toLowerCase().includes(searchLower) ||
        payment.user?.email?.toLowerCase().includes(searchLower) ||
        payment.transactionId?.toLowerCase().includes(searchLower) ||
        payment.plan?.toLowerCase().includes(searchLower)
      );
    }

    console.log('Filtered payment records:', JSON.stringify(filteredPayments, null, 2));
    res.json({
      payments: filteredPayments,
      pagination: {
        total: totalPayments,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPayments / limit),
        hasNextPage: parseInt(page) * parseInt(limit) < totalPayments,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get potential matches for a premium user
// @route   GET /api/admin/users/:id/potential-matches
// @access  Private/Admin
const getPotentialMatches = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { limit = 20 } = req.query;

    // Get the user to understand their preferences
    const user = await User.findById(userId).select('gender preferences age country city');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Build match query based on user preferences
    let matchQuery = {
      _id: { $ne: userId }, // Exclude the user themselves
      status: 'active' // Only active users
    };

    // Gender preference
    if (user.gender === 'male') {
      matchQuery.gender = 'female';
    } else if (user.gender === 'female') {
      matchQuery.gender = 'male';
    }

    // Age preference (if user has age)
    if (user.age) {
      const ageRange = 5; // 5 years range
      matchQuery.age = {
        $gte: Math.max(18, user.age - ageRange),
        $lte: Math.min(100, user.age + ageRange)
      };
    }

    // Location preference (same country preferred)
    if (user.country) {
      matchQuery.country = user.country;
    }

    // Get existing relationships to exclude already connected users
    const existingRelationships = await Relationship.find({
      $or: [
        { follower_user_id: userId },
        { followed_user_id: userId }
      ]
    }).select('follower_user_id followed_user_id');

    const excludeUserIds = existingRelationships.map(rel => 
      rel.follower_user_id === userId ? rel.followed_user_id : rel.follower_user_id
    );

    if (excludeUserIds.length > 0) {
      matchQuery._id = { $nin: [...excludeUserIds, userId] };
    }

    // Find potential matches
    const potentialMatches = await User.find(matchQuery)
      .select('fname lname username gender age country city profilePicture summary plan')
      .limit(parseInt(limit))
      .sort({ lastSeen: -1, createdAt: -1 });

    // Add compatibility score and additional info
    const matchesWithStats = potentialMatches.map(match => {
      const matchObj = match.toObject();
      matchObj.fullName = `${match.fname} ${match.lname}`;
      
      // Simple compatibility score based on location and age
      let compatibilityScore = 50; // Base score
      
      if (match.country === user.country) compatibilityScore += 20;
      if (match.city === user.city) compatibilityScore += 10;
      
      if (user.age && match.age) {
        const ageDiff = Math.abs(user.age - match.age);
        if (ageDiff <= 2) compatibilityScore += 15;
        else if (ageDiff <= 5) compatibilityScore += 10;
        else if (ageDiff <= 10) compatibilityScore += 5;
      }
      
      matchObj.compatibilityScore = Math.min(100, compatibilityScore);
      
      return matchObj;
    });

    // Sort by compatibility score
    matchesWithStats.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.json({
      matches: matchesWithStats,
      total: matchesWithStats.length,
      userId: userId
    });
  } catch (error) {
    console.error('Error fetching potential matches:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Process refund for a payment
// @route   POST /api/admin/payments/:id/refund
// @access  Private/Admin
const processRefund = async (req, res) => {
  try {
    const { id: paymentId } = req.params;
    const { reason } = req.body;

    // Find the payment
    const payment = await Payment.findById(paymentId).populate('user', 'fname lname email');
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if payment is already refunded
    if (payment.status === 'refunded') {
      return res.status(400).json({ message: 'Payment is already refunded' });
    }

    // Check if payment is eligible for refund (must be completed)
    if (payment.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed payments can be refunded' });
    }

    // Update payment status to refunded
    payment.status = 'refunded';
    payment.refundReason = reason || 'Admin refund';
    payment.refundedAt = new Date();
    await payment.save();

    // Update user plan back to freemium if this was a premium payment
    if (payment.plan === 'premium' && payment.user) {
      await User.findByIdAndUpdate(payment.user._id, {
        plan: 'freemium',
        planExpiresAt: null
      });
    }

    // Log the refund action
    console.log(`Payment ${paymentId} refunded by admin. User: ${payment.user?.email}, Amount: ${payment.amount}, Reason: ${reason}`);

    res.json({
      message: 'Payment refunded successfully',
      payment: {
        id: payment._id,
        status: payment.status,
        refundReason: payment.refundReason,
        refundedAt: payment.refundedAt,
        user: payment.user
      }
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Send manual match suggestions to a premium user
// @route   POST /api/admin/users/:id/send-suggestions
// @access  Private/Admin
const sendMatchSuggestions = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { suggestedUserIds } = req.body;

    if (!suggestedUserIds || !Array.isArray(suggestedUserIds) || suggestedUserIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of suggested user IDs' });
    }

    // Get the target user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is premium
    if (!['premium', 'pro'].includes(targetUser.plan)) {
      return res.status(400).json({ message: 'User must be premium to receive match suggestions' });
    }

    // Get suggested users with details
    const suggestedUsers = await User.find({
      _id: { $in: suggestedUserIds },
      status: 'active',
      emailVerified: true
    }).select('fname lname username email gender');

    if (suggestedUsers.length === 0) {
      return res.status(400).json({ message: 'No valid suggested users found' });
    }

    // Format match suggestions for email
    const matchSuggestions = suggestedUsers.map(user => ({
      name: `${user.fname} ${user.lname}`,
      username: user.username,
      email: user.email
    }));

    // Send email with match suggestions
    const emailSubject = 'Your Curated Match Suggestions from Quluub';
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c5aa0; text-align: center; margin-bottom: 20px;">Assalamu Alaikum ${targetUser.fname}!</h2>
          
          <p style="color: #333; font-size: 16px; line-height: 1.6;">We hope this message finds you in good health and high spirits. Our team has carefully curated some special match suggestions just for you:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2c5aa0; margin-bottom: 15px;">Your Curated Matches:</h3>
            ${matchSuggestions.map(match => `
              <div style="padding: 10px; border-bottom: 1px solid #e9ecef; margin-bottom: 10px;">
                <strong style="color: #2c5aa0;">${match.name}</strong> (@${match.username})<br>
                <span style="color: #6c757d; font-size: 14px;">Email: ${match.email}</span>
              </div>
            `).join('')}
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.6;">These suggestions have been personally selected by our team based on compatibility factors. We encourage you to reach out and start meaningful conversations, insha'Allah.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/matches" style="background-color: #2c5aa0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Your Matches</a>
          </div>
          
          <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">May Allah bless your search for a righteous spouse.<br>Barakallahu feeki,<br><strong>The Quluub Team</strong></p>
        </div>
      </div>
    `;

    await sendEmail(targetUser.email, emailSubject, emailContent);

    console.log(`Manual match suggestions sent to ${targetUser.username} (${targetUser.email})`);
    
    res.json({ 
      message: 'Match suggestions sent successfully',
      sentTo: targetUser.email,
      suggestionsCount: suggestedUsers.length
    });
  } catch (error) {
    console.error('Error sending manual match suggestions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getStats,
  getAllUsers,
  getUserDetails,
  updateUserAccountStatus,
  updateUserPlan,
  updateUser,
  deleteUser,
  sendPasswordResetLink,
  verifyUserEmail,
  getAllCalls,
  saveCallRecord,
  handleSendBulkEmail,
  sendTestEmail,
  getEmailMetrics,
  saveEmailConfig,
  getEmailConfig,
  getReportedProfiles,
  dismissReport,
  getPremiumUsers,
  getPaymentHistory,
  getPotentialMatches,
  processRefund,
  sendMatchSuggestions,
  sendAdminPushNotification,
  getAdminPushNotifications,
};
