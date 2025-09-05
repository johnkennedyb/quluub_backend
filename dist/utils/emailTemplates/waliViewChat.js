const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliViewChatEmail = (waliName, wardName, brotherName, chatLink) => {
  const subject = 'Notification: Your Ward is Chatting on Quluub';
  const title = 'Your Ward is Chatting';
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
                <td style="padding:30px; font-family: Arial, sans-serif; font-size:16px; color:#333; line-height:1.6;">
                  <p>Dear ${waliName},</p>
                  <p>Salaamun alaekum</p>
                  <p>We wanted to inform you that your ward, ${wardName}, is currently chatting with ${brotherName} on Quluub. As her guardian, you can view the conversation through the following link:</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${chatLink}" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">View Chat</a>
                  </p>
                  <p>Thank you for your attention to this matter.</p>
                  <p>JazaakumuLlahu khairan,<br>
                  The Quluub Team</p>
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

module.exports = waliViewChatEmail;
