
const Subscription = require('../models/Subscription');
const User = require('../models/User');

// @desc    Get all subscriptions
// @route   GET /api/admin/subscriptions
// @access  Private (Admin only)
exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({})
      .populate('user', 'username fname lname email')
      .sort({ createdAt: -1 });

    // Ensure we return consistent data structure
    const formattedSubscriptions = subscriptions.map(sub => ({
      _id: sub._id,
      user: {
        _id: sub.user._id,
        username: sub.user.username,
        fname: sub.user.fname,
        lname: sub.user.lname,
        email: sub.user.email,
        fullName: `${sub.user.fname} ${sub.user.lname}`
      },
      plan: sub.plan,
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      paymentId: sub.paymentId,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    }));

    res.json({ subscriptions: formattedSubscriptions });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
