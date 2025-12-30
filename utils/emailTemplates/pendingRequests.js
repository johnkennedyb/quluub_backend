const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const pendingRequestsEmail = (recipientName, requestCount) => {
  const subject = 'Pending Connection Requests Awaiting Your Response';
  const title = 'Pending Requests';
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
                    You have ${requestCount} new connection requests waiting for your response on Quluub.
                  </p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                    Please take a moment to review these requests and either accept or decline them.
                  </p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">May Allaah guide you in making the best decision.</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">JazaakumuLlahu khairan,<br/>The Quluub Team<br/><span style="opacity:0.9;">Where every heart finds a home.</span></p>
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

module.exports = pendingRequestsEmail;
