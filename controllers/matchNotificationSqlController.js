const { sqlQuery } = require('../config/sql');
const userRepo = require('../repositories/userRepository');
const { sendEmail } = require('../utils/emailService');

function calcAgeFromDob(dob) {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  } catch { return null; }
}

async function sendMatchNotifications(req, res) {
  try {
    const premiumUsers = await sqlQuery(
      `SELECT id, fname, lname, email, gender, dob, country, city, username, plan, status
       FROM users WHERE plan IN ('premium','pro') AND status = 'active'`
    );

    let notificationsSent = 0;
    const results = [];

    for (const user of premiumUsers) {
      try {
        // Collect exclude IDs from relationships
        const rels = await sqlQuery(
          `SELECT follower_user_id, followed_user_id FROM relationships WHERE follower_user_id = ? OR followed_user_id = ?`,
          [user.id, user.id]
        );
        const excludeIds = new Set([user.id]);
        for (const r of rels) {
          if (r.follower_user_id === user.id) excludeIds.add(r.followed_user_id);
          else excludeIds.add(r.follower_user_id);
        }
        const excludeArr = Array.from(excludeIds);

        // Build dynamic conditions
        const conds = [`status = 'active'`];
        const params = [];
        if (user.gender === 'male') conds.push(`gender = 'female'`);
        else if (user.gender === 'female') conds.push(`gender = 'male'`);
        if (user.country) { conds.push(`country = ?`); params.push(user.country); }

        // Optional age preference ±5 years
        const userAge = calcAgeFromDob(user.dob);
        if (userAge !== null) {
          // Filter using dob bounds: dob between (now - (age+5) years) and (now - (age-5) years)
          conds.push(`dob IS NOT NULL`);
          conds.push(`TIMESTAMPDIFF(YEAR, dob, CURDATE()) BETWEEN ? AND ?`);
          params.push(Math.max(18, userAge - 5), Math.min(100, userAge + 5));
        }

        // Exclude existing connections
        let excludeSql = '';
        if (excludeArr.length) {
          excludeSql = ` AND id NOT IN (${excludeArr.map(() => '?').join(',')})`;
          params.push(...excludeArr);
        }

        const sql = `SELECT id, fname, lname, username, dob, country, city, summary
                     FROM users WHERE ${conds.join(' AND ')}${excludeSql}
                     ORDER BY COALESCE(lastSeen, '1970-01-01') DESC LIMIT 10`;
        const potentialMatches = await sqlQuery(sql, params);

        if (potentialMatches.length > 0) {
          const matchesHtml = potentialMatches.map(match => `
            <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 8px 0; background: #f9f9f9;">
              <h3 style="margin: 0 0 8px 0; color: #333;">${match.fname || ''} ${match.lname || ''}</h3>
              <p style="margin: 4px 0; color: #666;"><strong>Username:</strong> @${match.username}</p>
              <p style="margin: 4px 0; color: #666;"><strong>Age:</strong> ${calcAgeFromDob(match.dob) ?? 'Not specified'}</p>
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
                <p style="color: #333; font-size: 16px; margin-bottom: 20px;">Dear ${user.fname || 'Member'},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">As a premium member, we've found some exciting new matches for you! Here are ${potentialMatches.length} potential connections based on your preferences:</p>
                ${matchesHtml}
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/browse" 
                     style="background: #75c0f9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Browse More Matches
                  </a>
                </div>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #999; font-size: 12px;">
                  <p>This is an automated message sent to premium members. To unsubscribe from match notifications, please contact support.</p>
                  <p>© ${new Date().getFullYear()} Quluub - Islamic Marriage Platform</p>
                </div>
              </div>
            </div>`;

          await sendEmail({ to: user.email, subject: `🌟 ${potentialMatches.length} New Matches Found for You!`, html: emailHtml });
          notificationsSent++;
          results.push({ userId: user.id, email: user.email, matchesFound: potentialMatches.length, status: 'sent' });
        } else {
          results.push({ userId: user.id, email: user.email, matchesFound: 0, status: 'no_matches' });
        }
      } catch (error) {
        console.error(`Error processing matches for user ${user.id}:`, error);
        results.push({ userId: user.id, email: user.email, status: 'error', error: error.message });
      }
    }

    res.json({ message: `Match notifications processed for ${premiumUsers.length} premium users`, notificationsSent, totalPremiumUsers: premiumUsers.length, results });
  } catch (error) {
    console.error('Error sending match notifications (SQL):', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getMatchNotificationHistory(req, res) {
  try {
    const premiumUsers = await sqlQuery(`SELECT id, fname, lname, email, plan, lastSeen FROM users WHERE plan IN ('premium','pro') AND status = 'active' ORDER BY COALESCE(lastSeen, '1970-01-01') DESC`);
    res.json({
      totalPremiumUsers: premiumUsers.length,
      premiumUsers: premiumUsers.map(u => ({ id: u.id, name: `${u.fname || ''} ${u.lname || ''}`.trim(), email: u.email, plan: u.plan, joinDate: null, lastSeen: u.lastSeen }))
    });
  } catch (error) {
    console.error('Error fetching match notification history (SQL):', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { sendMatchNotifications, getMatchNotificationHistory };
