const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const validateEmail = (recipientName, validationLink, verificationCode) => {
  const subject = 'Your Quluub Verification Code';
  const title = 'Verify Your Email';
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
                <td style="padding:30px; font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  <p>Salaamun alaekum ${recipientName},</p>
                  <p>Thank you for registering with Quluub! To complete your registration and start your journey to finding your perfect match, please use the verification code below:</p>
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0; text-align: center;">
                    <tr>
                      <td style="background: linear-gradient(135deg, #14b8a6, #0f766e); padding: 25px; border-radius: 15px;">
                        <p style="color: white; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">Your Verification Code</p>
                        <div style="background: rgba(255, 255, 255, 0.95); color: #14b8a6; padding: 15px 20px; border-radius: 10px; font-size: 28px; letter-spacing: 8px; font-weight: bold; font-family: 'Courier New', monospace; display: inline-block;">
                          ${verificationCode}
                        </div>
                      </td>
                    </tr>
                  </table>

                  <p style="text-align: center; margin-bottom: 15px; color: #666; font-size: 14px;">Enter this code in the verification dialog to complete your registration.</p>

                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 25px 0;">
                    <tr>
                      <td style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 0 8px 8px 0;">
                        <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 500;">⏰ <strong>Important:</strong> This verification code will expire in 10 minutes. If you didn't request this, please ignore this email.</p>
                      </td>
                    </tr>
                  </table>
                  <p>May Allaah grant you success in this journey.</p>
                  <p>JazaakumuLlahu khairan,<br/>
                  The Quluub Team<br/>
                  <span style="opacity:0.9;">Where every heart finds a home.</span></p>
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

module.exports = validateEmail;
