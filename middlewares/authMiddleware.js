const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendPlanExpiredEmail } = require('../utils/emailService');
const { getPool } = require('../config/sql');
const userRepo = require('../repositories/userRepository');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Prefer SQL when enabled and pool is ready, otherwise fallback to Mongo
      let sqlMode = false;
      if (process.env.SQL_ENABLED === 'true' || process.env.SQL_REQUIRED === 'true') {
        try {
          getPool();
          sqlMode = true;
        } catch (e) {
          sqlMode = false;
        }
      }

      if (sqlMode) {
        const sqlUser = await userRepo.findById(decoded.id);
        if (!sqlUser) {
          return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        // Attach safe user (no password)
        const { password, ...safeUser } = sqlUser;
        req.user = safeUser;

        // Handle premium expiration in SQL
        if (
          req.user.plan === 'premium' &&
          req.user.premiumExpirationDate &&
          new Date(req.user.premiumExpirationDate) < new Date()
        ) {
          try {
            await userRepo.updateById(req.user._id, { plan: 'freemium', premiumExpirationDate: null });
            try { sendPlanExpiredEmail(req.user.email, req.user.fname); } catch (e) {}
            req.user.plan = 'freemium';
            req.user.premiumExpirationDate = null;
          } catch (e) {}
        }

        // Fire-and-forget: update lastSeen and isOnline in SQL
        userRepo.updateById(req.user._id, { lastSeen: new Date(), isOnline: true })
          .catch(err => console.error('Error updating SQL user lastSeen:', err));
      } else {
        // Mongo fallback
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
          return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        if (
          req.user.plan === 'premium' &&
          req.user.premiumExpirationDate &&
          new Date(req.user.premiumExpirationDate) < new Date()
        ) {
          req.user.plan = 'freemium';
          req.user.premiumExpirationDate = null;
          try {
            await req.user.save();
            try { sendPlanExpiredEmail(req.user.email, req.user.fname); } catch (e) {}
          } catch (e) {}
        }

        // Update user's last seen timestamp on every authenticated API request (fire-and-forget)
        User.findByIdAndUpdate(decoded.id, { 
          lastSeen: new Date(),
          isOnline: true 
        }).catch(err => {
          // Silent error handling to avoid blocking the request
          console.error('Error updating user lastSeen:', err);
        });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.type === 'ADMIN') {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized as an admin' });
  }
};

module.exports = { protect, admin };
