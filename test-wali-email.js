require('dotenv').config();
const { sendEmail } = require('./utils/emailService');
const createEmailHeader = require('./utils/emailTemplates/components/emailHeader');
const createEmailFooter = require('./utils/emailTemplates/components/emailFooter');

const sendTestWaliEmail = async (recipientEmail) => {
  const subject = 'Wali Notifications';
  const title = 'Wali Notifications';
  const recipientName = 'Test Wali';

  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${createEmailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${recipientName},</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  This is a test email to verify that the Wali Notification footer has been updated correctly.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Please check the footer of this email to ensure it matches the new design.
                </p>
              </td>
            </tr>
            ${createEmailFooter()}
          </table>
        </td>
      </tr>
    </table>
  `;

  try {
    console.log(`Sending test email to ${recipientEmail}...`);
    await sendEmail({ to: recipientEmail, subject, html });
    console.log('Test email sent successfully!');
  } catch (error) {
    console.error('Failed to send test email:', error);
  }
};

// Replace with a valid email address to receive the test email
const testEmailAddress = 'test@example.com'; 
sendTestWaliEmail(testEmailAddress);
