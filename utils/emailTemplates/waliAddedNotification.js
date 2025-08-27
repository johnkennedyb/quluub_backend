const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliAddedNotificationEmail = (waliName, wardName) => {
  const subject = 'Wali Profile Added - Quluub';
  const title = 'Wali Profile Notification';
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
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Dear ${waliName},</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                    You have been added as a Wali (guardian) for ${wardName} on the Quluub platform. You will receive notifications about their activities and can monitor their conversations as needed.
                  </p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                    JazaakumuLlahu khairan,<br>
                    The Quluub Team
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

module.exports = waliAddedNotificationEmail;
