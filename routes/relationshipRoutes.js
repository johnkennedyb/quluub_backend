
const express = require('express');
const { 
  sendRequest, 
  respondToRequest, 
  withdrawRequest, 
  getMatches,
  getPendingRequests,
  getSentRequests
} = require('../controllers/relationshipController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/request', protect, sendRequest);
router.put('/:id/status', protect, respondToRequest);
router.delete('/withdraw/:id', protect, withdrawRequest);
router.get('/matches', protect, getMatches);
router.get('/pending', protect, getPendingRequests);
router.get('/sent', protect, getSentRequests);

module.exports = router;
