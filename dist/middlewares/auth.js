
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  
  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Admin middleware to check if user is admin
const isAdmin = (req, res, next) => {
  console.log('Checking admin privileges for user:', req.user?.username);
  if (req.user && req.user.type === 'ADMIN') {
    console.log('Admin access granted');
    next();
  } else {
    console.log('Admin access denied for user type:', req.user?.type);
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
};

module.exports = { protect, isAdmin };
