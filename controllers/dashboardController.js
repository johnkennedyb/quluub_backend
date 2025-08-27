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

// @desc    Hard ping database and force refresh all user data
// @route   POST /api/dashboard/ping
// @access  Private
const pingDatabase = async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`🔥 HARD DATABASE PING initiated for user: ${userId}`);
        
        // 1. Force update user's activity timestamps and refresh user data
        const user = await User.findByIdAndUpdate(
            userId,
            { 
                lastSeen: new Date(),
                lastPing: new Date(),
                // Force update to trigger any middleware or hooks
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        ).select('-password').populate('favorites', 'fname lname username email gender').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 2. Force recalculate all relationship counts with fresh database queries
        const [matchesCount, pendingRequestsCount, sentRequestsCount, totalMatches, totalPendingReceived, totalSentRequests] = await Promise.all([
            // Get matches count
            Relationship.countDocuments({
                $or: [{ follower_user_id: userId }, { followed_user_id: userId }],
                status: 'matched'
            }),
            // Get pending requests count (requests sent to the user)
            Relationship.countDocuments({ followed_user_id: userId, status: 'pending' }),
            // Get sent requests count (requests sent by the user)
            Relationship.countDocuments({ follower_user_id: userId, status: 'pending' }),
            // Get full matches data
            Relationship.find({
                $or: [{ follower_user_id: userId }, { followed_user_id: userId }],
                status: 'matched'
            }).populate('follower_user_id followed_user_id', 'fname lname username email gender profileViews').lean(),
            // Get full pending requests data
            Relationship.find({ followed_user_id: userId, status: 'pending' }).populate('follower_user_id', 'fname lname username email gender').lean(),
            // Get full sent requests data
            Relationship.find({ follower_user_id: userId, status: 'pending' }).populate('followed_user_id', 'fname lname username email gender').lean()
        ]);

        // 3. Force update user's profile view count if it exists
        const profileViews = user.profileViews || 0;
        
        // 4. Get fresh user data one more time to ensure we have the latest
        const freshUser = await User.findById(userId).select('-password').lean();
        
        console.log(`✅ HARD PING completed for user: ${user.username}`);
        console.log(`📊 Stats: Matches=${matchesCount}, Pending=${pendingRequestsCount}, Sent=${sentRequestsCount}, Views=${profileViews}`);
        
        res.json({
            success: true,
            message: 'Hard database ping successful - all data refreshed',
            timestamp: new Date(),
            user: {
                ...freshUser,
                lastPing: new Date()
            },
            stats: {
                matchesCount,
                pendingRequestsCount,
                sentRequestsCount,
                profileViews
            },
            relationships: {
                matches: totalMatches,
                pendingRequests: totalPendingReceived,
                sentRequests: totalSentRequests
            },
            dataRefreshed: true,
            pingType: 'HARD_PING'
        });

    } catch (error) {
        console.error('❌ Error in hard database ping:', error);
        res.status(500).json({ 
            message: 'Server Error during hard ping',
            error: error.message,
            timestamp: new Date()
        });
    }
};

// @desc    Get fresh user settings data with hard refresh
// @route   GET /api/dashboard/user-settings
// @access  Private
const getUserSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`🔄 HARD USER SETTINGS REFRESH for user: ${userId}`);
        
        // Force refresh user data with all related data populated
        const user = await User.findById(userId)
            .select('-password')
            .populate('favorites', 'fname lname username email gender profileViews')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Force recalculate ALL user statistics with multiple queries to ensure accuracy
        const [matchesCount, pendingRequestsCount, sentRequestsCount, allMatches, allPendingRequests, allSentRequests, userProfileData] = await Promise.all([
            // Count queries
            Relationship.countDocuments({
                $or: [{ follower_user_id: userId }, { followed_user_id: userId }],
                status: 'matched'
            }),
            Relationship.countDocuments({ followed_user_id: userId, status: 'pending' }),
            Relationship.countDocuments({ follower_user_id: userId, status: 'pending' }),
            
            // Full data queries
            Relationship.find({
                $or: [{ follower_user_id: userId }, { followed_user_id: userId }],
                status: 'matched'
            }).populate('follower_user_id followed_user_id', 'fname lname username email gender profileViews').lean(),
            
            Relationship.find({ followed_user_id: userId, status: 'pending' })
                .populate('follower_user_id', 'fname lname username email gender profileViews').lean(),
            
            Relationship.find({ follower_user_id: userId, status: 'pending' })
                .populate('followed_user_id', 'fname lname username email gender profileViews').lean(),
            
            // Get fresh user profile data again
            User.findById(userId).select('-password').lean()
        ]);

        // Calculate additional stats
        const totalConnections = matchesCount + pendingRequestsCount + sentRequestsCount;
        const profileViews = userProfileData.profileViews || 0;
        
        console.log(`✅ HARD SETTINGS REFRESH completed`);
        console.log(`📊 Complete Stats: Matches=${matchesCount}, Pending=${pendingRequestsCount}, Sent=${sentRequestsCount}, Views=${profileViews}`);

        res.json({
            user: {
                ...userProfileData,
                // Ensure we have the latest timestamps
                lastSeen: userProfileData.lastSeen || new Date(),
                lastPing: new Date()
            },
            stats: {
                matchesCount,
                pendingRequestsCount,
                sentRequestsCount,
                profileViews,
                totalConnections,
                favoritesCount: user.favorites ? user.favorites.length : 0
            },
            relationships: {
                matches: allMatches,
                pendingRequests: allPendingRequests,
                sentRequests: allSentRequests
            },
            lastUpdated: new Date(),
            refreshType: 'HARD_SETTINGS_REFRESH'
        });

    } catch (error) {
        console.error('❌ Error in hard user settings refresh:', error);
        res.status(500).json({ 
            message: 'Server Error during hard settings refresh',
            error: error.message,
            timestamp: new Date()
        });
    }
};

module.exports = { getCombinedDashboardData, pingDatabase, getUserSettings };
