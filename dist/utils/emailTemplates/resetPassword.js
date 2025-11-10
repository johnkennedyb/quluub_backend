const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const resetPasswordEmail = (recipientName, resetLink) => {
  const subject = 'Password Reset Request';
  const title = 'Password Reset';
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        @media screen and (max-width: 600px) {
          .container {
            width: 100% !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
        <!-- Header -->
        ${emailHeader(title)}

        <!-- Body -->
        <tr>
          <td align="center" style="padding: 0 10px;">
            <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
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
                    For security reasons, this link will expire in 1 hour. If you need further assistance, please contact our support team at 
                    <a href="mailto:support@quluub.com" style="color:#075e54;">support@quluub.com</a>.
                  </p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">May Allaah grant you success in this journey.</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                    JazaakumuLlahu khairan,<br/>
                    The Quluub Team<br/>
                    <span style="opacity:0.9;">Where every heart finds a home.</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center">
            <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;">
               ${emailFooterWithIcons}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, html };
};

module.exports = resetPasswordEmail;
