const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const resetPasswordEmail = (recipientName, resetLink) => {
  const subject = 'Password Reset Request';
  const title = 'Password Reset';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${recipientName},</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  We received a request to reset your password for your Quluub account. If you didn't request a password reset, please ignore this email.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333; text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">Reset Your Password</a>
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  For security reasons, this link will expire in 1 hour. If you need further assistance, please contact our support team.
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

module.exports = resetPasswordEmail;
