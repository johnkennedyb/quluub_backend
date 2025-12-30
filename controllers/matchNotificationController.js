const User = require('../models/User');
const Relationship = require('../models/Relationship');
const { sendEmail } = require('../utils/emailService');

// @desc    Send match notifications to premium users
// @route   POST /api/admin/send-match-notifications
// @access  Private/Admin
const sendMatchNotifications = async (req, res) => {
  try {
    // Get all premium users
    const premiumUsers = await User.find({ 
      plan: { $in: ['premium', 'pro'] },
      status: 'active',
      emailVerified: true
    }).select('_id fname lname email gender age country city preferences');

    let notificationsSent = 0;
    const results = [];

    for (const user of premiumUsers) {
      try {
        // Get existing relationships to exclude
        const existingRelationships = await Relationship.find({
          $or: [
            { follower_user_id: user._id },
            { followed_user_id: user._id }
          ]
        });

        const excludeUserIds = existingRelationships.map(rel => 
          rel.follower_user_id.toString() === user._id.toString() 
            ? rel.followed_user_id 
            : rel.follower_user_id
        );

        // Build match query
        let matchQuery = {
          _id: { $nin: [...excludeUserIds, user._id] },
          status: 'active',
          emailVerified: true
        };

        // Gender preference
        if (user.gender === 'male') {
          matchQuery.gender = 'female';
        } else if (user.gender === 'female') {
          matchQuery.gender = 'male';
        }

        // Age preference
        if (user.age) {
          const ageRange = 5;
          matchQuery.age = {
            $gte: Math.max(18, user.age - ageRange),
            $lte: Math.min(100, user.age + ageRange)
          };
        }

        // Location preference (same country)
        if (user.country) {
          matchQuery.country = user.country;
        }

        // Find potential matches
        const potentialMatches = await User.find(matchQuery)
          .select('fname lname username age country city profilePicture summary')
          .limit(10)
          .sort({ lastSeen: -1, createdAt: -1 });

        if (potentialMatches.length > 0) {
          // Create email content
          const matchesHtml = potentialMatches.map(match => `
            <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 8px 0; background: #f9f9f9;">
              <h3 style="margin: 0 0 8px 0; color: #333;">${match.fname} ${match.lname}</h3>
              <p style="margin: 4px 0; color: #666;"><strong>Username:</strong> @${match.username}</p>
              <p style="margin: 4px 0; color: #666;"><strong>Age:</strong> ${match.age || 'Not specified'}</p>
              <p style="margin: 4px 0; color: #666;"><strong>Location:</strong> ${match.city || 'Not specified'}, ${match.country || 'Not specified'}</p>
              ${match.summary ? `<p style="margin: 8px 0; color: #555;"><strong>About:</strong> ${match.summary}</p>` : ''}
              <div style="margin-top: 12px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/profile/${match.username}" 
                   style="background: #75c0f9; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  View Profile
                </a>
              </div>
            </div>
          `).join('');

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #75c0f9 0%, #4a90e2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">🌟 New Matches for You!</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9;">Premium Match Suggestions</p>
              </div>
              
              <div style="padding: 20px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
                  Dear ${user.fname},
                </p>
                
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                  As a premium member, we've found some exciting new matches for you! Here are ${potentialMatches.length} potential connections based on your preferences:
                </p>
                
                ${matchesHtml}
                
                <div style="margin-top: 30px; padding: 20px; background: #f0f8ff; border-radius: 8px; border-left: 4px solid #75c0f9;">
                  <h3 style="margin: 0 0 10px 0; color: #333;">💡 Premium Benefits</h3>
                  <ul style="color: #666; line-height: 1.6; margin: 0; padding-left: 20px;">
                    <li>Unlimited messaging with matches</li>
                    <li>Advanced search filters</li>
                    <li>Priority profile visibility</li>
                    <li>Weekly match suggestions</li>
                  </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/browse" 
                     style="background: #75c0f9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Browse More Matches
                  </a>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #999; font-size: 12px;">
                  <p>This is an automated message sent to premium members. To unsubscribe from match notifications, please contact support.</p>
                  <p>© 2024 Quluub - Islamic Marriage Platform</p>
                </div>
              </div>
            </div>
          `;

          // Send email
          await sendEmail({
            to: user.email,
            subject: `🌟 ${potentialMatches.length} New Matches Found for You!`,
            html: emailHtml
          });

          notificationsSent++;
          results.push({
            userId: user._id,
            email: user.email,
            matchesFound: potentialMatches.length,
            status: 'sent'
          });
        } else {
          results.push({
            userId: user._id,
            email: user.email,
            matchesFound: 0,
            status: 'no_matches'
          });
        }
      } catch (error) {
        console.error(`Error processing matches for user ${user._id}:`, error);
        results.push({
          userId: user._id,
          email: user.email,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      message: `Match notifications processed for ${premiumUsers.length} premium users`,
      notificationsSent,
      totalPremiumUsers: premiumUsers.length,
      results
    });
  } catch (error) {
    console.error('Error sending match notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get match notification history
// @route   GET /api/admin/match-notifications
// @access  Private/Admin
const getMatchNotificationHistory = async (req, res) => {
  try {
    // This would typically come from a MatchNotification model
    // For now, return basic info about premium users
    const premiumUsers = await User.find({ 
      plan: { $in: ['premium', 'pro'] },
      status: 'active'
    }).select('fname lname email plan createdAt lastSeen')
      .sort({ createdAt: -1 });

    res.json({
      totalPremiumUsers: premiumUsers.length,
      premiumUsers: premiumUsers.map(user => ({
        id: user._id,
        name: `${user.fname} ${user.lname}`,
        email: user.email,
        plan: user.plan,
        joinDate: user.createdAt,
        lastSeen: user.lastSeen
      }))
    });
  } catch (error) {
    console.error('Error fetching match notification history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  sendMatchNotifications,
  getMatchNotificationHistory
};
