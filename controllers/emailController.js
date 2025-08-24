
const User = require('../models/User');
const crypto = require('crypto');
const { sendValidationEmail, sendResetPasswordEmail } = require('../utils/emailService');

// Temporary store for verification codes (in production, use Redis)
const verificationCodes = new Map();

// Clean up expired codes every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
}, 10 * 60 * 1000);

// @desc    Send email validation for existing users
// @route   POST /api/email/send-validation
// @access  Public
exports.sendEmailValidation = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log('Sending email validation for existing user:', email);
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email' });
    }
    
    // Check if email is already validated
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already validated' });
    }
    
    // Generate validation token
    const validationToken = crypto.randomBytes(32).toString('hex');
    
    // Save token to user
    user.validationToken = validationToken;
    user.validationTokenExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();
    
    // Send validation email
    const emailSent = await sendValidationEmail(email, validationToken);
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send validation email' });
    }
    
    console.log('Validation email sent successfully to:', email);
    res.json({ 
      message: 'Validation email sent successfully',
      email: email
    });
    
  } catch (error) {
    console.error('Error sending email validation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send email verification code for new users (pre-signup)
// @route   POST /api/email/send-verification
// @access  Public
exports.sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log('Sending verification code to:', email);
    
    // Check if email is already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store verification code with 10-minute expiration
    verificationCodes.set(email, {
      code: verificationCode,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0
    });
    
    try {
      // Send verification email with a default name
      console.log('Attempting to send verification email to:', email);
      const emailSent = await sendValidationEmail(email, 'User', verificationCode);
      
      if (!emailSent) {
        console.error('Email sending returned false');
        return res.status(500).json({ 
          message: 'Failed to send verification code',
          details: 'Email service returned false'
        });
      }
    } catch (emailError) {
      console.error('Error in sendValidationEmail:', emailError);
      return res.status(500).json({ 
        message: 'Failed to send verification code',
        details: emailError.message,
        stack: process.env.NODE_ENV === 'development' ? emailError.stack : undefined
      });
    }
    
    console.log('Verification code sent successfully to:', email);
    
    // In a real app, you would store the code in a temporary store and not return it
    res.json({ 
      message: 'Verification code sent successfully',
      email: email,
      // In production, don't return the code in the response
      code: process.env.NODE_ENV === 'development' ? verificationCode : undefined
    });
    
  } catch (error) {
    console.error('Error sending verification code:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Verify email with code (pre-signup)
// @route   POST /api/email/verify-code
// @access  Public
exports.verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }
    
    console.log('Verifying code for:', email);
    
    // Check if code format is valid (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Invalid verification code format' });
    }
    
    // Get stored verification data
    const storedData = verificationCodes.get(email);
    
    if (!storedData) {
      return res.status(400).json({ 
        message: 'No verification code found for this email. Please request a new code.' 
      });
    }
    
    // Check if code has expired
    if (Date.now() > storedData.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ 
        message: 'Verification code has expired. Please request a new code.' 
      });
    }
    
    // Check for too many attempts
    if (storedData.attempts >= 5) {
      verificationCodes.delete(email);
      return res.status(400).json({ 
        message: 'Too many failed attempts. Please request a new verification code.' 
      });
    }
    
    // Verify the actual code
    if (storedData.code !== code) {
      storedData.attempts += 1;
      return res.status(400).json({ 
        message: 'Invalid verification code. Please try again.',
        attemptsRemaining: 5 - storedData.attempts
      });
    }
    
    // Code is valid - remove from store
    verificationCodes.delete(email);
    
    console.log('Email verification successful for:', email);
    res.json({ 
      success: true,
      message: 'Email verified successfully',
      email: email
    });
    
  } catch (error) {
    console.error('Error verifying email code:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Verify email with token
// @route   POST /api/email/verify
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Validation token is required' });
    }
    
    console.log('Verifying email with token:', token.substring(0, 8) + '...');
    
    // Find user with this validation token
    const user = await User.findOne({
      validationToken: token,
      validationTokenExpiration: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired validation token' 
      });
    }
    
    // Mark email as verified
    user.emailVerified = true;
    user.validationToken = '';
    user.validationTokenExpiration = null;
    user.status = 'active'; // Activate account if it was pending
    await user.save();
    
    console.log('Email verified successfully for user:', user.email);
    res.json({ 
      message: 'Email verified successfully',
      user: {
        _id: user._id,
        email: user.email,
        fname: user.fname,
        lname: user.lname,
        emailVerified: user.emailVerified,
        status: user.status
      }
    });
    
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Resend email validation
// @route   POST /api/email/resend-validation
// @access  Private
exports.resendEmailValidation = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if email is already validated
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already validated' });
    }
    
    console.log('Resending email validation for user:', user.email);
    
    // Generate new validation token
    const validationToken = crypto.randomBytes(32).toString('hex');
    
    // Save token to user
    user.validationToken = validationToken;
    user.validationTokenExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();
    
    // Send validation email
    const emailSent = await sendValidationEmail(user.email, validationToken);
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send validation email' });
    }
    
    console.log('Validation email resent successfully to:', user.email);
    res.json({ 
      message: 'Validation email sent successfully',
      email: user.email
    });
    
  } catch (error) {
    console.error('Error resending email validation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Check email verification status
// @route   GET /api/email/status
// @access  Private
exports.getEmailVerificationStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('email emailVerified validationTokenExpiration');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      email: user.email,
      emailVerified: user.emailVerified || false,
      hasValidationToken: !!user.validationTokenExpiration && user.validationTokenExpiration > Date.now()
    });
    
  } catch (error) {
    console.error('Error getting email verification status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send password reset email
// @route   POST /api/email/forgot-password
// @access  Public
exports.sendPasswordResetEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log('Sending password reset email for:', email);
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpiration = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    
    // Send password reset email
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const emailSent = await sendResetPasswordEmail(user.email, user.fname, resetLink);
    
    if (!emailSent) {
      console.error('Failed to send password reset email to:', email);
    } else {
      console.log('Password reset email sent successfully to:', email);
    }
    
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
    
  } catch (error) {
    console.error('Error sending password reset email:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Reset password with token
// @route   POST /api/email/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    console.log('Resetting password with token:', token.substring(0, 8) + '...');
    
    // Find user with this reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordTokenExpiration: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token' 
      });
    }
    
    // Hash the new password before saving
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = hashedPassword;
    user.resetPasswordToken = '';
    user.resetPasswordTokenExpiration = null;
    await user.save();
    
    console.log('Password reset successfully for user:', user.email);
    res.json({ 
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
