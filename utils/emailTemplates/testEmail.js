const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const testEmail = (recipientEmail) => {
  const subject = 'Quluub Email Service Test';
  const title = 'Email Service Test';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Hello,</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  This is a test email from the Quluub email service.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  If you have received this email, it means your email configuration is working correctly.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  This email was sent to: <strong>${recipientEmail}</strong>
                </p>
              </td>
            </tr>
            ${emailFooterWithIcons}
          </table>
        </td>
      </tr>
    </table>
  `;

  return { subject, html };
};

module.exports = testEmail;
