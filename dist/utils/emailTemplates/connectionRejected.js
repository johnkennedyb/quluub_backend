const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const connectionRejectedEmail = (recipientName) => {
  const subject = 'Connection Request Update on Quluub';
  const title = 'Connection Request Declined';
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
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Dear ${recipientName},</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                    Unfortunately, your recent connection request has been declined. Remember, everything happens by Allaah's will. Stay patient and trust in His plan.
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

module.exports = connectionRejectedEmail;
