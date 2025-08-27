const nodemailer = require('nodemailer');
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

// Maileroo SMTP configuration
console.log('Loading Maileroo email configuration...');
console.log('SMTP Host: smtp.maileroo.com');
console.log('SMTP Port: 465');
console.log('Mail User: mail@quluub.com');

let emailConfig = {
  host: 'smtp.maileroo.com',
  port: 465,
  secure: true,
  auth: {
    user: 'mail@quluub.com',
    pass: 'a870017e53102ebeaee7a381'
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true,
  logger: true
};

console.log('Email configuration loaded:', {
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.secure,
  hasAuth: !!emailConfig.auth.user
});

// Email settings
let emailSettings = {
  fromName: process.env.FROM_NAME || 'Quluub Team',
  fromEmail: process.env.FROM_EMAIL || 'mail@quluub.com',
  replyTo: process.env.REPLY_TO || 'support@quluub.com'
};

// Create transporter with current configuration
let transporter = nodemailer.createTransport(emailConfig);

// Verify transporter configuration
const verifyTransporter = () => {
  console.log('\n--- Verifying email transporter configuration ---');
  console.log('Host:', emailConfig.host);
  console.log('Port:', emailConfig.port);
  console.log('Secure:', emailConfig.secure);
  
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email transporter verification failed:', error.message);
      if (error.code) console.error('Error code:', error.code);
      if (error.command) console.error('Failed command:', error.command);
      if (error.response) {
        console.error('SMTP Error Response:', {
          code: error.responseCode,
          response: error.response
        });
      }
      console.error('Error stack:', error.stack);
    } else {
      console.log('✅ Email transporter verified successfully');
      console.log('Server is ready to accept messages');
    }
  });
};

// Verify on startup
console.log('\n--- Initializing email service ---');
verifyTransporter();

// Generic email sending function with Maileroo API fallback
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
    
    // Try Maileroo API first
    console.log('Attempting to send via Maileroo API...');
    const apiSuccess = await sendEmailViaAPI(to, subject, html, emailSettings.fromEmail);
    
    if (apiSuccess) {
      console.log('✅ Email sent successfully via Maileroo API');
      return true;
    }
    
    console.log('Maileroo API failed, falling back to SMTP...');
    
    const mailOptions = {
      from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
      to,
      subject,
      html,
      replyTo: emailSettings.replyTo,
    };
    
    console.log('Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasHtml: !!mailOptions.html
    });
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    return true;
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    if (error.response) {
      console.error('SMTP Error:', {
        code: error.responseCode,
        response: error.response
      });
    }
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Enhanced email sending function with attachment support
const sendEmailWithAttachments = async (to, templateFunction, attachments = [], ...args) => {
  console.log(`\n--- Attempting to send email with attachments to: ${to} ---`);
  
  try {
    const { subject, html } = templateFunction(...args);
    console.log('Subject:', subject);
    console.log('Attachments:', attachments.length);
    
    const mailOptions = {
      from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
      to,
      subject,
      html,
      replyTo: emailSettings.replyTo,
      attachments: attachments
    };
    
    console.log('Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasHtml: !!mailOptions.html,
      attachmentCount: attachments.length
    });
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email with attachments sent successfully');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    return true;
    
  } catch (error) {
    console.error('❌ Email with attachments sending failed:', error.message);
    if (error.response) {
      console.error('SMTP Error:', {
        code: error.responseCode,
        response: error.response
      });
    }
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Function to update email configuration
const updateEmailConfig = async (newConfig) => {
  try {
    emailConfig = {
      host: newConfig.smtpHost,
      port: parseInt(newConfig.smtpPort),
      secure: parseInt(newConfig.smtpPort) === 465,
      auth: {
        user: newConfig.smtpUser,
        pass: newConfig.smtpPassword
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    emailSettings = {
      fromName: newConfig.fromName,
      fromEmail: newConfig.fromEmail,
      replyTo: newConfig.replyTo
    };

    // Create new transporter with updated config
    transporter = nodemailer.createTransport(emailConfig);
    
    // Verify new configuration
    return new Promise((resolve) => {
      transporter.verify((error, success) => {
        if (error) {
          console.error('Updated email transporter verification failed:', error);
          resolve(false);
        } else {
          console.log('Updated email transporter verified successfully');
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error('Error updating email-service configuration:', error);
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
const sendContactWaliEmail = (email, brotherName) => sendEmail({ ...contactWaliEmailTemplate(brotherName), to: email });
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

// New function to send bulk emails
const sendBulkEmail = async (users, subject, message, attachments = []) => {
  let successCount = 0;
  let failedCount = 0;

  for (const user of users) {
    const mailOptions = {
      from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
      to: user.email,
      subject: subject,
      html: `
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
      `,
      attachments: attachments
    };

    try {
      await transporter.sendMail(mailOptions);
      successCount++;
      console.log(`Bulk email sent to: ${user.email}`);
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

// New function to send test emails
const sendTestEmail = async (testEmail) => {
  const mailOptions = {
    from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
    to: testEmail,
    subject: 'Test Email - Quluub Configuration',
    html: `<h1>Test Email</h1><p>This is a test email to verify your email configuration.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Test email sent successfully');
  } catch (error) {
    console.error('Error sending test email:', error);
    throw error;
  }
};

// Function to get the current email configuration
const getEmailConfigService = () => {
  return { ...emailConfig, ...emailSettings };
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
