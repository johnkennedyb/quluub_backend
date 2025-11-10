const cron = require('node-cron');
const User = require('../models/User');
const ScheduledEmail = require('../models/ScheduledEmail');
const Relationship = require('../models/Relationship');
const UserActivityLog = require('../models/UserActivityLog');
const {
  sendBulkEmail: sendBulkEmailService,
  sendProfileViewEmail,
  sendPendingRequestsEmail,
  sendEncourageUnhideEmail,
  sendSuggestedAccountsEmail
} = require('./emailService');

const startScheduler = () => {
  console.log('Email scheduler started with all jobs.');

  // 1. Admin-scheduled bulk emails (runs every minute)
  cron.schedule('* * * * *', async () => {
    // console.log('Checking for admin-scheduled emails...');
    const now = new Date();

    try {
      const emailsToSend = await ScheduledEmail.find({
        status: 'pending',
        sendAt: { $lte: now },
      });

      if (emailsToSend.length === 0) {
        // console.log('No scheduled emails to send at this time.');
        return;
      }

      console.log(`Found ${emailsToSend.length} admin-scheduled email(s) to send.`);

      for (const email of emailsToSend) {
        try {
          let recipients = [];
          if (email.sendToAll) {
            recipients = await User.find({});
          } else {
            recipients = await User.find({ '_id': { $in: email.recipients } });
          }

          if (recipients.length > 0) {
            await sendBulkEmailService(recipients, email.subject, email.message, email.attachments);
          }

          email.status = 'sent';
          await email.save();
          console.log(`Successfully sent scheduled email: ${email.subject}`);
        } catch (error) {
          console.error(`Failed to send scheduled email: ${email.subject}`, error);
          email.status = 'failed';
          email.error = error.message;
          email.lastAttempt = new Date();
          await email.save();
        }
      }
    } catch (error) {
      console.error('Error fetching admin-scheduled emails:', error);
    }
  });

  // 2. Weekly Profile View Summary (runs every Sunday at 7 PM)
  cron.schedule('0 19 * * 0', async () => {
    console.log('Running weekly profile view summary job...');
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentViews = await UserActivityLog.aggregate([
        { $match: { action: 'PROFILE_VIEW', createdAt: { $gte: oneWeekAgo } } },
        { $group: { _id: '$receiverId', viewCount: { $sum: 1 } } }
      ]);

      for (const view of recentViews) {
        const user = await User.findById(view._id);
        if (user && user.email && user.settings.emailNotifications) {
          sendProfileViewEmail(user.email, user.fname, view.viewCount);
        }
      }
    } catch (error) {
      console.error('Error in weekly profile view job:', error);
    }
  });

  // 3. Pending Connection Requests Reminder (runs every 48 hours at 10 AM)
  cron.schedule('0 10 */2 * *', async () => {
    console.log('Running pending connection requests reminder job (every 48 hours)...');
    try {
      const pendingRequests = await Relationship.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$followed_user_id', requestCount: { $sum: 1 } } }
      ]);

      for (const request of pendingRequests) {
        const user = await User.findById(request._id);
        if (user && user.email && user.settings.emailNotifications) {
          sendPendingRequestsEmail(user.email, user.fname, request.requestCount);
        }
      }
    } catch (error) {
      console.error('Error in pending requests reminder job:', error);
    }
  });

  // 4. Suggested Matches (runs every Friday at 3 PM)
  cron.schedule('0 15 * * 5', async () => {
    console.log('Running suggested matches email job...');
    try {
      const users = await User.find({ 'settings.emailNotifications': true, 'settings.showSuggestions': true });

      for (const user of users) {
        const existingConnections = await Relationship.find({ $or: [{ follower_user_id: user._id }, { followed_user_id: user._id }] }).select('follower_user_id followed_user_id');
        const connectedUserIds = existingConnections.map(rel => (rel.follower_user_id.toString() === user._id.toString() ? rel.followed_user_id : rel.follower_user_id));
        connectedUserIds.push(user._id); // Exclude self

        const suggestions = await User.find({
          _id: { $nin: connectedUserIds },
          gender: user.gender === 'male' ? 'female' : 'male',
          country: user.country,
          'settings.profileVisibility': 'visible'
        }).limit(5);

        if (suggestions.length > 0) {
          sendSuggestedAccountsEmail(user.email, user.fname, suggestions);
        }
      }
    } catch (error) {
      console.error('Error in suggested matches job:', error);
    }
  });

  // 5. Monthly Premium Match Suggestions (runs on the 1st of every month at 10 AM)
  cron.schedule('0 10 1 * *', async () => {
    console.log('Running monthly premium match suggestions job...');
    try {
      // Get all premium users
      const premiumUsers = await User.find({
        plan: { $in: ['premium', 'pro'] },
        status: 'active',
        emailVerified: true,
        'settings.emailNotifications': true
      }).select('_id fname lname email gender country city preferences');

      console.log(`Found ${premiumUsers.length} premium users for monthly match suggestions`);

      for (const user of premiumUsers) {
        try {
          // Get existing relationships to exclude
          const existingConnections = await Relationship.find({
            $or: [
              { follower_user_id: user._id },
              { followed_user_id: user._id }
            ]
          }).select('follower_user_id followed_user_id');

          const connectedUserIds = existingConnections.map(rel => 
            rel.follower_user_id.toString() === user._id.toString() 
              ? rel.followed_user_id 
              : rel.follower_user_id
          );
          connectedUserIds.push(user._id); // Exclude self

          // Find opposite gender matches
          const oppositeGender = user.gender === 'male' ? 'female' : 'male';
          const matchSuggestions = await User.find({
            _id: { $nin: connectedUserIds },
            gender: oppositeGender,
            status: 'active',
            emailVerified: true,
            'settings.profileVisibility': { $ne: 'hidden' }
          })
          .select('fname lname username email country city')
          .limit(5);

          if (matchSuggestions.length > 0) {
            // Create email content with usernames and emails
            const matchList = matchSuggestions.map(match => 
              `• ${match.fname} ${match.lname} (@${match.username}) - ${match.email}`
            ).join('\n');

            const emailSubject = 'Monthly Match Suggestions - Quluub Premium';
            const emailContent = `
              <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
                <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://res.cloudinary.com/dn82ie7wt/image/upload/v1752017813/WhatsApp_Image_2025-07-08_at_17.57.16_40b9a289_v3d7iy.jpg" alt="Quluub" style="max-width: 200px; height: auto;" />
                  </div>
                  <h2 style="color: #075e54; text-align: center; margin-bottom: 20px;">Monthly Premium Match Suggestions</h2>
                  <p style="color: #333; line-height: 1.6; font-size: 16px;">Salaamun alaekum ${user.fname},</p>
                  <p style="color: #333; line-height: 1.6; font-size: 16px;">As a valued premium member, here are your personalized match suggestions for this month:</p>
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #075e54; margin-bottom: 15px;">Suggested Matches:</h3>
                    <div style="color: #333; line-height: 1.8; font-family: monospace; white-space: pre-line;">${matchList}</div>
                  </div>
                  <p style="color: #333; line-height: 1.6; font-size: 16px;">These suggestions are based on your preferences and location. Visit your dashboard to view full profiles and send connection requests.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/matches" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">View Matches</a>
                  </div>
                  <p style="color: #666; font-size: 14px; text-align: center;">May Allah guide you to your perfect match. Barakallahu feeki.</p>
                </div>
              </div>
            `;

            // Send email using the email service
            const { sendEmail } = require('./emailService');
            await sendEmail(user.email, () => ({ subject: emailSubject, html: emailContent }));
            
            console.log(`Monthly match suggestions sent to ${user.fname} ${user.lname} (${user.email})`);
          } else {
            console.log(`No match suggestions found for ${user.fname} ${user.lname}`);
          }
        } catch (userError) {
          console.error(`Error processing monthly matches for user ${user._id}:`, userError);
        }
      }
    } catch (error) {
      console.error('Error in monthly premium match suggestions job:', error);
    }
  });

  // 6. Encourage Unhiding Profile (runs on the 1st of every month at 11 AM)
  cron.schedule('0 11 1 * *', async () => {
    console.log('Running encourage unhide profile job (monthly)...');
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hiddenUsers = await User.find({
        'settings.profileVisibility': 'hidden',
        'settings.profileVisibilityChangedAt': { $lte: oneWeekAgo },
        'settings.emailNotifications': true
      });

      for (const user of hiddenUsers) {
        sendEncourageUnhideEmail(user.email, user.fname);
      }
    } catch (error) {
      console.error('Error in encourage unhide profile job:', error);
    }
  });
};

module.exports = { startScheduler };
