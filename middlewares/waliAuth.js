const jwt = require('jsonwebtoken');
const User = require('../models/User');

const waliAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).send('<h1>Access Denied</h1><p>No authentication token provided. Please log in as a Wali to view this page.</p>');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const waliUser = await User.findById(decoded.id).select('-password');
    
    if (!waliUser) {
        return res.status(401).send('<h1>Access Denied</h1><p>Invalid token. User not found.</p>');
    }
    
    req.user = waliUser; // Attach user to request

    const ward = await User.findById(req.params.wardId);

    if (!ward || !ward.waliDetails) {
      return res.status(404).send('<h1>Not Found</h1><p>The requested ward or their wali details could not be found.</p>');
    }

    const waliDetails = JSON.parse(ward.waliDetails);

    if (waliDetails.email !== req.user.email) {
      return res.status(403).send('<h1>Forbidden</h1><p>You are not authorized to view this conversation. This page is for the designated Wali only.</p>');
    }

    next();
  } catch (error) {
    console.error('Wali Auth Error:', error);
    return res.status(401).send('<h1>Authentication Failed</h1><p>Your session is invalid or has expired. Please log in again.</p>');
  }
};

module.exports = { waliAuth };
