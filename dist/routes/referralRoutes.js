
const express = require('express');
const { 
  generateReferralCode, 
  applyReferralCode, 
  getReferralStats 
} = require('../controllers/referralController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/generate', protect, generateReferralCode);
router.post('/apply', protect, applyReferralCode);
router.get('/stats', protect, getReferralStats);

module.exports = router;
