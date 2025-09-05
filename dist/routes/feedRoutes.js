const express = require('express');
const { 
  getFeed,
  markFeedItemRead
} = require('../controllers/feedController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.get('/', protect, getFeed);
router.put('/:id/read', protect, markFeedItemRead);

module.exports = router;
