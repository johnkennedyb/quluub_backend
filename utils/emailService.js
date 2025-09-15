const { sendEmailViaAPI } = require('./mailerooService');

// Import email templates
const welcomeEmailTemplate = require('./emailTemplates/welcome');
const resetPasswordEmailTemplate = require('./emailTemplates/resetPassword');
const waliNewJoinerEmailTemplate = require('./emailTemplates/waliNewJoiner');
const connectionRequestEmailTemplate = require('./emailTemplates/connectionRequest');
const connectionRejectedEmailTemplate = require('./emailTemplates/connectionRejected');
const requestWithdrawnEmailTemplate = require('./emailTemplates/requestWithdrawn');
const profileViewEmailTemplate = require('./emailTemplates/profileView');
const pendingRequestsEmailTemplate = require('./emailTemplates/pendingRequests');
const purchasePlanEmailTemplate = require('./emailTemplates/purchasePlan');
const planPurchasedEmailTemplate = require('./emailTemplates/planPurchased');
const planExpiringEmailTemplate = require('./emailTemplates/planExpiring');
const planExpiredEmailTemplate = require('./emailTemplates/planExpired');
const encourageUnhideEmailTemplate = require('./emailTemplates/encourageUnhide');
const suggestedAccountsEmailTemplate = require('./emailTemplates/suggestedAccounts');
const contactWaliEmailTemplate = require('./emailTemplates/contactWali');
const waliViewChatEmailTemplate = require('./emailTemplates/waliViewChat');
const validateEmailTemplate = require('./emailTemplates/validateEmail');
const videoCallNotificationEmailTemplate = require('./emailTemplates/videoCallNotification');
const testEmailTemplate = require('./emailTemplates/testEmail');

// Email configuration for API-only service
console.log('Loading Maileroo API email configuration...');

// Email settings
let emailSettings = {
  fromName: process.env.FROM_NAME || 'Quluub Team',
  fromEmail: process.env.FROM_EMAIL || 'mail@match.quluub.com',
  replyTo: process.env.REPLY_TO || 'support@match.quluub.com'
};

// Initialize email service
console.log('✅ Email service initialized with Maileroo API');

// Generic email sending function using Maileroo API only
const sendEmail = async (emailOptions) => {
  // Handle both old format (to, templateFunction, ...args) and new format ({ to, subject, html })
  let to, subject, html;
  
  if (typeof emailOptions === 'string') {
    // Old format: sendEmail(to, templateFunction, ...args)
    to = arguments[0];
    const templateFunction = arguments[1];
    const args = Array.prototype.slice.call(arguments, 2);
    if (typeof templateFunction !== 'function') {
      throw new Error('The provided template is not a function.');
    }
    const result = templateFunction(...args);
    subject = result.subject;
    html = result.html;
  } else if (emailOptions && typeof emailOptions === 'object') {
    // New format: sendEmail({ to, subject, html })
    to = emailOptions.to;
    subject = emailOptions.subject;
    html = emailOptions.html;
  } else {
    throw new Error('Invalid email options provided');
  }
  
  console.log(`\n--- Attempting to send email to: ${to} ---`);
  
  try {
    console.log('Subject:', subject);
    
    // Send via Maileroo API
    console.log('Sending via Maileroo API...');
    const apiSuccess = await sendEmailViaAPI(to, subject, html, emailSettings.fromEmail);
    
    if (apiSuccess) {
      console.log('✅ Email sent successfully via Maileroo API');
      return true;
    } else {
      console.error('❌ Email sending failed via Maileroo API');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Enhanced email sending function with attachment support (API-only)
const sendEmailWithAttachments = async (to, templateFunction, attachments = [], ...args) => {
  console.log(`\n--- Attempting to send email with attachments to: ${to} ---`);
  console.log('⚠️ Note: Attachments not supported via API, sending email without attachments');
  
  try {
    const { subject, html } = templateFunction(...args);
    console.log('Subject:', subject);
    
    // Send via API without attachments
    const apiSuccess = await sendEmailViaAPI(to, subject, html, emailSettings.fromEmail);
    
    if (apiSuccess) {
      console.log('✅ Email sent successfully via Maileroo API (without attachments)');
      return true;
    } else {
      console.error('❌ Email sending failed via Maileroo API');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Email with attachments sending failed:', error.message);
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Function to update email configuration (API-only)
const updateEmailConfig = async (newConfig) => {
  try {
    emailSettings = {
      fromName: newConfig.fromName,
      fromEmail: newConfig.fromEmail,
      replyTo: newConfig.replyTo
    };

    console.log('✅ Email configuration updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating email configuration:', error);
    return false;
  }
};

// Specific email functions
const sendWelcomeEmail = (email, recipientName) => sendEmail({ ...welcomeEmailTemplate(recipientName), to: email });
const sendResetPasswordEmail = (email, recipientName, resetLink) => sendEmail({ ...resetPasswordEmailTemplate(recipientName, resetLink), to: email });
const sendWaliNewJoinerEmail = (email, waliName, sisterName) => sendEmail({ ...waliNewJoinerEmailTemplate(waliName, sisterName), to: email });
const sendConnectionRequestEmail = (email, recipientName, requesterUsername) => sendEmail({ ...connectionRequestEmailTemplate(recipientName, requesterUsername), to: email });
const sendConnectionRejectedEmail = (email, recipientName) => sendEmail({ ...connectionRejectedEmailTemplate(recipientName), to: email });
const sendRequestWithdrawnEmail = (email, recipientName, withdrawerName) => sendEmail({ ...requestWithdrawnEmailTemplate(recipientName, withdrawerName), to: email });
const sendProfileViewEmail = (email, recipientName, viewCount) => sendEmail({ ...profileViewEmailTemplate(recipientName, viewCount), to: email });
const sendPendingRequestsEmail = (email, recipientName, requestCount) => sendEmail({ ...pendingRequestsEmailTemplate(recipientName, requestCount), to: email });
const sendPurchasePlanEmail = (email, recipientName) => sendEmail({ ...purchasePlanEmailTemplate(recipientName), to: email });
const sendPlanPurchasedEmail = (email, recipientName) => sendEmail({ ...planPurchasedEmailTemplate(recipientName), to: email });
const sendPlanExpiringEmail = (email, recipientName) => sendEmail({ ...planExpiringEmailTemplate(recipientName), to: email });
const sendPlanExpiredEmail = (email, recipientName) => sendEmail({ ...planExpiredEmailTemplate(recipientName), to: email });
const sendEncourageUnhideEmail = (email, recipientName) => sendEmail({ ...encourageUnhideEmailTemplate(recipientName), to: email });
const sendSuggestedAccountsEmail = (email, recipientName) => sendEmail({ ...suggestedAccountsEmailTemplate(recipientName), to: email });
const sendContactWaliEmail = (waliEmail, brotherName) => {
  const contactWaliEmailTemplate = require('./emailTemplates/contactWali');
  return sendEmail({ ...contactWaliEmailTemplate(brotherName), to: waliEmail });
};

// Function to send wali added notification email
const sendWaliAddedNotificationEmail = (waliEmail, waliName, wardName) => {
  const waliAddedNotificationEmailTemplate = require('./emailTemplates/waliAddedNotification');
  return sendEmail({ ...waliAddedNotificationEmailTemplate(waliName, wardName), to: waliEmail });
};

const sendWaliViewChatEmail = (email, waliName, wardName, brotherName, chatLink) => sendEmail({ ...waliViewChatEmailTemplate(waliName, wardName, brotherName, chatLink), to: email });

// Enhanced function for sending wali emails with direct chat viewing links
const sendWaliViewChatEmailWithChatLink = (email, waliName, wardName, brotherName, chatLink) => sendEmail({ ...waliViewChatEmailTemplate(waliName, wardName, brotherName, chatLink), to: email });

// Enhanced Wali email functions with file attachments
const sendWaliViewChatEmailWithAttachments = (email, waliName, wardName, brotherName, chatLink, attachments = []) => 
  sendEmailWithAttachments(email, waliViewChatEmailTemplate, attachments, waliName, wardName, brotherName, chatLink);
const sendVideoCallNotificationEmail = (parentEmail, waliName, wardName, brotherName, callDetails, reportLink) => sendEmail({ ...videoCallNotificationEmailTemplate(waliName, wardName, brotherName, callDetails, reportLink), to: parentEmail });
const sendVideoCallNotificationEmailWithAttachments = (parentEmail, waliName, wardName, brotherName, callDetails, reportLink, attachments = []) => 
  sendEmailWithAttachments(parentEmail, videoCallNotificationEmailTemplate, attachments, waliName, wardName, brotherName, callDetails, reportLink);

const sendValidationEmail = (email, recipientName, validationToken) => {
  const validationUrl = `${process.env.FRONTEND_URL}/validate-email?token=${validationToken}`;
  // Pass both the validation URL and the token (which is the verification code)
  return sendEmail({ ...validateEmailTemplate(recipientName, validationUrl, validationToken), to: email });
};

// New function to send bulk emails (API-only)
const sendBulkEmail = async (users, subject, message, attachments = []) => {
  let successCount = 0;
  let failedCount = 0;

  if (attachments.length > 0) {
    console.log('⚠️ Note: Attachments not supported via API, sending emails without attachments');
  }

  for (const user of users) {
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #075e54; margin: 0;">Quluub</h1>
            <p style="color: #666; font-size: 16px; margin-top: 10px;">Islamic Marriage Platform</p>
          </div>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Assalamu Alaikum ${user.fname || 'Dear Member'},
          </p>
          
          <div style="color: #666; line-height: 1.6; margin: 20px 0;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              Best regards,<br>
              The Quluub Team<br>
              <a href="${process.env.FRONTEND_URL}" style="color: #075e54;">quluub.com</a>
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      const apiSuccess = await sendEmailViaAPI(user.email, subject, html, emailSettings.fromEmail);
      if (apiSuccess) {
        successCount++;
        console.log(`Bulk email sent to: ${user.email}`);
      } else {
        failedCount++;
        console.error(`Failed to send bulk email to ${user.email}: API failed`);
      }
    } catch (error) {
      failedCount++;
      console.error(`Failed to send bulk email to ${user.email}:`, error);
    }
  }

  if (failedCount > 0) {
    throw new Error(`${failedCount} out of ${successCount + failedCount} emails failed to send.`);
  }

  return { successCount, failedCount };
};

// New function to send test emails (API-only)
const sendTestEmail = async (testEmail) => {
  const subject = 'Test Email - Quluub Configuration';
  const html = `<h1>Test Email</h1><p>This is a test email to verify your email configuration.</p>`;

  try {
    const apiSuccess = await sendEmailViaAPI(testEmail, subject, html, emailSettings.fromEmail);
    if (apiSuccess) {
      console.log('Test email sent successfully via API');
    } else {
      throw new Error('API email sending failed');
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    throw error;
  }
};

// Function to get the current email configuration
const getEmailConfigService = () => {
  return { ...emailSettings };
};

// Function to get email metrics (placeholder)
const getEmailMetricsService = async () => {
  return {
    sentLast24Hours: 0,
    sentLast7Days: 0,
    failedLast24Hours: 0,
    totalSent: 0,
    totalFailed: 0,
  };
};

module.exports = {
  sendEmail,
  updateEmailConfig,
  sendValidationEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendWaliNewJoinerEmail,
  sendConnectionRequestEmail,
  sendConnectionRejectedEmail,
  sendRequestWithdrawnEmail,
  sendProfileViewEmail,
  sendPendingRequestsEmail,
  sendPurchasePlanEmail,
  sendPlanPurchasedEmail,
  sendPlanExpiringEmail,
  sendPlanExpiredEmail,
  sendEncourageUnhideEmail,
  sendSuggestedAccountsEmail,
  sendContactWaliEmail,
  sendWaliAddedNotificationEmail,
  sendWaliViewChatEmail,
  sendWaliViewChatEmailWithAttachments,
  sendWaliViewChatEmailWithChatLink,
  sendVideoCallNotificationEmail,
  sendVideoCallNotificationEmailWithAttachments,
  sendBulkEmail,
  sendTestEmail,
  getEmailConfigService,
  getEmailMetricsService
};
