
const User = require('../models/User');
const crypto = require('crypto');

// @desc    Generate referral code for user
// @route   POST /api/referrals/generate
// @access  Private
exports.generateReferralCode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.referralCode) {
      return res.json({ referralCode: user.referralCode });
    }
    
    // Generate unique referral code
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    user.referralCode = referralCode;
    await user.save();
    
    res.json({ referralCode });
  } catch (error) {
    console.error('Generate referral code error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Apply referral code
// @route   POST /api/referrals/apply
// @access  Private
exports.applyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (currentUser.referredBy) {
      return res.status(400).json({ message: 'You have already used a referral code' });
    }
    
    // Find referrer
    const referrer = await User.findOne({ referralCode });
    
    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }
    
    if (referrer._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot refer yourself' });
    }
    
    // Update current user
    currentUser.referredBy = referrer._id;
    currentUser.referralStatus = 'Verified';
    await currentUser.save();
    
    // Increment referrer's stats
    referrer.referralStats.completedReferrals = (referrer.referralStats.completedReferrals || 0) + 1;

    // Check if the referrer has earned a premium reward (for every 5 referrals)
    if (referrer.referralStats.completedReferrals > 0 && referrer.referralStats.completedReferrals % 5 === 0) {
      referrer.plan = 'premium';
      
      const now = new Date();
      const currentExpiration = referrer.premiumExpirationDate && referrer.premiumExpirationDate > now 
        ? referrer.premiumExpirationDate 
        : now;
        
      // Add one month to the expiration date
      currentExpiration.setMonth(currentExpiration.getMonth() + 1);
      referrer.premiumExpirationDate = currentExpiration;

      // Track total earnings in months
      referrer.referralStats.totalEarnings = (referrer.referralStats.totalEarnings || 0) + 1;

      console.log(`User ${referrer.username} earned 1 month of premium via referral. Total referrals: ${referrer.referralStats.completedReferrals}`);
    }

    await referrer.save();
    
    res.json({ message: 'Referral code applied successfully' });
  } catch (error) {
    console.error('Apply referral code error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get referral stats
// @route   GET /api/referrals/stats
// @access  Private
exports.getReferralStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      referralCode: user.referralCode,
      referralStats: user.referralStats,
      referralStatus: user.referralStatus
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
