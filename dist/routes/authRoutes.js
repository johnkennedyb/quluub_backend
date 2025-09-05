
const express = require('express');
const { 
  signup, 
  login, 
  getUserProfile, 
  changePassword,
  adminSignup,
  googleAuth,
  resendValidationEmail
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/signup', signup);
router.post('/admin/signup', adminSignup);
router.post('/login', login);
router.post('/google', googleAuth); // New Google OAuth route
router.get('/profile', protect, getUserProfile);
router.put('/change-password', protect, changePassword);
router.post('/resend-validation', resendValidationEmail);

module.exports = router;
