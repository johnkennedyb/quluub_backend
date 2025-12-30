const crypto = require('crypto');
const referralRepo = require('../repositories/referralRepository');
const userRepo = require('../repositories/userRepository');

// POST /api/referrals/generate
async function generateReferralCode(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();

    let record = await referralRepo.getByUserId(userId);
    if (!record) record = await referralRepo.upsertUser(userId);

    if (record?.referralCode) {
      return res.json({ referralCode: record.referralCode });
    }

    // Generate unique referral code
    let referralCode = '';
    for (let i = 0; i < 5; i++) {
      referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Basic uniqueness guard
      const taken = await referralRepo.isReferralCodeTaken(referralCode);
      if (!taken) break;
      referralCode = '';
    }

    if (!referralCode) {
      return res.status(500).json({ message: 'Failed to generate referral code' });
    }

    await referralRepo.setReferralCode(userId, referralCode);
    return res.json({ referralCode });
  } catch (error) {
    console.error('Generate referral code (SQL) error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// POST /api/referrals/apply
async function applyReferralCode(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const { referralCode } = req.body || {};
    if (!referralCode) return res.status(400).json({ message: 'Referral code is required' });

    let current = await referralRepo.getByUserId(userId);
    if (!current) current = await referralRepo.upsertUser(userId);

    if (current?.referredBy) {
      return res.status(400).json({ message: 'You have already used a referral code' });
    }

    const referrer = await referralRepo.findByReferralCode(referralCode);
    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }
    if (String(referrer.userId) === String(userId)) {
      return res.status(400).json({ message: 'You cannot refer yourself' });
    }

    await referralRepo.applyReferral(userId, referrer.userId);

    // Increment referrer stats and possibly award premium month every 5
    const afterInc = await referralRepo.incrementReferrerStats(referrer.userId);
    const completed = Number(afterInc?.completedReferrals || 0);

    if (completed > 0 && completed % 5 === 0) {
      // Award 1 month premium
      const refUser = await userRepo.findById(referrer.userId);
      if (refUser) {
        const now = new Date();
        const base = refUser.premiumExpirationDate && new Date(refUser.premiumExpirationDate) > now
          ? new Date(refUser.premiumExpirationDate)
          : now;
        base.setMonth(base.getMonth() + 1);
        await userRepo.updateById(refUser._id, {
          plan: 'premium',
          premiumExpirationDate: base,
        });
        await referralRepo.updateTotalEarnings(referrer.userId, 1);
      }
    }

    return res.json({ message: 'Referral code applied successfully' });
  } catch (error) {
    console.error('Apply referral code (SQL) error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET /api/referrals/stats
async function getReferralStats(req, res) {
  try {
    const userId = (req.user._id || req.user.id).toString();
    let record = await referralRepo.getByUserId(userId);
    if (!record) record = await referralRepo.upsertUser(userId);

    const referralStats = {
      completedReferrals: Number(record?.completedReferrals || 0),
      totalEarnings: Number(record?.totalEarnings || 0),
    };

    return res.json({
      referralCode: record?.referralCode || null,
      referralStats,
      referralStatus: record?.referralStatus || 'None',
    });
  } catch (error) {
    console.error('Get referral stats (SQL) error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = {
  generateReferralCode,
  applyReferralCode,
  getReferralStats,
};
