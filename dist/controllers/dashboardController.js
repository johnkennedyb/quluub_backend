const Relationship = require('../models/Relationship');
const User = require('../models/User');
const Message = require('../models/Message');
const Call = require('../models/Call');

// Helper function to generate activity feed items
const generateActivityFeed = async (userId) => {
    try {
        const feedItems = [];
        
        // Get recent messages (last 24 hours)
        const recentMessages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }],
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
        .populate('sender', 'fname lname username')
        .populate('receiver', 'fname lname username')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

        // Get recent video calls (last 24 hours)
        const recentCalls = await Call.find({
            $or: [{ caller: userId }, { recipient: userId }],
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
        .populate('caller', 'fname lname username')
        .populate('recipient', 'fname lname username')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

        // Process messages into feed items
        recentMessages.forEach(message => {
            const isReceived = message.receiver._id.toString() === userId;
            const otherUser = isReceived ? message.sender : message.receiver;
            
            if (message.messageType === 'video_call_invitation') {
                feedItems.push({
                    id: message._id.toString(),
                    type: 'video_call',
                    user: {
                        username: otherUser.username,
                        profile_pic: null
                    },
                    message: isReceived 
                        ? `${otherUser.fname} ${otherUser.lname} invited you to a video call`
                        : `You invited ${otherUser.fname} ${otherUser.lname} to a video call`,
                    timestamp: message.createdAt,
                    videoCallData: message.videoCallData
                });
            } else {
                feedItems.push({
                    id: message._id.toString(),
                    type: 'message',
                    user: {
                        username: otherUser.username,
                        profile_pic: null
                    },
                    message: isReceived 
                        ? `${otherUser.fname} ${otherUser.lname} sent you a message`
                        : `You sent a message to ${otherUser.fname} ${otherUser.lname}`,
                    timestamp: message.createdAt
                });
            }
        });

        // Process video calls into feed items
        recentCalls.forEach(call => {
            const isReceived = call.recipient._id.toString() === userId;
            const otherUser = isReceived ? call.caller : call.recipient;
            
            let statusMessage = '';
            switch (call.status) {
                case 'completed':
                    statusMessage = isReceived 
                        ? `Video call with ${otherUser.fname} ${otherUser.lname} completed`
                        : `You completed a video call with ${otherUser.fname} ${otherUser.lname}`;
                    break;
                case 'missed':
                    statusMessage = isReceived 
                        ? `You missed a video call from ${otherUser.fname} ${otherUser.lname}`
                        : `${otherUser.fname} ${otherUser.lname} missed your video call`;
                    break;
                case 'declined':
                    statusMessage = isReceived 
                        ? `You declined a video call from ${otherUser.fname} ${otherUser.lname}`
                        : `${otherUser.fname} ${otherUser.lname} declined your video call`;
                    break;
                case 'ringing':
                    statusMessage = isReceived 
                        ? `Incoming video call from ${otherUser.fname} ${otherUser.lname}`
                        : `Calling ${otherUser.fname} ${otherUser.lname}`;
                    break;
                default:
                    statusMessage = isReceived 
                        ? `Video call from ${otherUser.fname} ${otherUser.lname}`
                        : `Video call to ${otherUser.fname} ${otherUser.lname}`;
            }

            feedItems.push({
                id: call._id.toString(),
                type: 'video_call',
                user: {
                    username: otherUser.username,
                    profile_pic: null
                },
                message: statusMessage,
                timestamp: call.createdAt,
                videoCallData: {
                    callerId: call.caller._id.toString(),
                    callerName: `${call.caller.fname} ${call.caller.lname}`,
                    sessionId: call.roomId,
                    status: call.status
                }
            });
        });

        // Sort all feed items by timestamp (newest first) and limit to 20
        return feedItems
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);

    } catch (error) {
        console.error('Error generating activity feed:', error);
        return [];
    }
};

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

        // Get recent activity feed items (messages and video calls)
        const feedItems = await generateActivityFeed(userId);

        res.json({
            matches,
            pendingRequests,
            sentRequests,
            profileViewsCount: user ? user.profileViews : 0,
            favorites: user ? user.favorites : [],
            feedItems
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
