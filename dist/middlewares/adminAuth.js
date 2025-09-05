
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  let token;
  
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      if (!token) {
        console.log('❌ Admin auth failed: No token provided');
        return res.status(401).json({ message: 'Not authorized, no token provided' });
      }
      
      console.log('🔍 Admin auth: Token received, verifying...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🔍 Admin auth: Token decoded, user ID:', decoded.id);
      
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        console.log('❌ Admin auth failed: User not found for ID:', decoded.id);
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      
      console.log('🔍 Admin auth: User found, type:', user.type);
      
      // Check if user is admin
      if (user.type !== 'ADMIN') {
        console.log('❌ Admin auth failed: User is not admin, type:', user.type);
        return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
      }
      
      console.log('✅ Admin auth successful for user:', user.username);
      req.user = user;
      next();
    } catch (error) {
      console.error('❌ Admin auth error:', error.message);
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Not authorized, invalid token' });
      } else if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Not authorized, token expired' });
      } else {
        return res.status(401).json({ message: 'Not authorized, token failed' });
      }
    }
  } else {
    console.log('❌ Admin auth failed: No authorization header');
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

module.exports = { adminAuth };
