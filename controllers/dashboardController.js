const Relationship = require('../models/Relationship');
const User = require('../models/User');

// @desc    Get all data for the dashboard in a single call
// @route   GET /api/dashboard/combined
// @access  Private
const getCombinedDashboardData = async (req, res) => {
    try {
        const userId = req.user.id;

        const [matches, pendingRequests, sentRequests, user] = await Promise.all([
            // Get matches
            Relationship.find({
                $or: [{ follower_user_id: userId }, { followed_user_id: userId }],
                status: 'matched'
            }).populate('follower_user_id followed_user_id', 'fname lname username email gender profileViews'),

            // Get pending requests (requests sent to the user)
            Relationship.find({ followed_user_id: userId, status: 'pending' }).populate('follower_user_id', 'fname lname username email gender'),

            // Get sent requests (requests sent by the user)
            Relationship.find({ follower_user_id: userId, status: 'pending' }).populate('followed_user_id', 'fname lname username email gender'),

            // Get user data for profile views and favorites
            User.findById(userId).populate('favorites', 'fname lname username email gender').lean()
        ]);

        console.log('Matches data being sent:', JSON.stringify(matches, null, 2));

        res.json({
            matches,
            pendingRequests,
            sentRequests,
            profileViewsCount: user ? user.profileViews : 0,
            favorites: user ? user.favorites : [],
            feedItems: [] // Return empty array as Feed model doesn't exist
        });

    } catch (error) {
        console.error('Error fetching combined dashboard data:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getCombinedDashboardData };
