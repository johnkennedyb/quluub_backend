const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliNewJoinerEmail = (waliName, sisterName) => {
  const subject = 'Your Ward Has Joined Quluub';
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
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${waliName},</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">We hope this message finds you in the best of health and iman. We are writing to inform you that your ward, ${sisterName}, has recently joined Quluub, our comprehensive platform designed to assist with marriage and family-related services.</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">As a valued guardian, we understand the importance of your role in her journey. Rest assured that Quluub is committed to providing a secure and supportive environment that upholds Islamic values.</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">If you have any questions or need further information, please do not hesitate to contact us at <a href="mailto:support@quluub.com" style="color:#075e54;">support@quluub.com</a>. We are here to support you and your ward throughout this process.</p>
                  <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">May Allaah grant you success in this journey.</p>
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

module.exports = waliNewJoinerEmail;
