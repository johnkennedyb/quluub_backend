const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const welcomeEmail = (recipientName) => {
  const subject = 'Welcome to Quluub - Your Journey Begins!';
  const title = 'Welcome to Quluub!';
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
                  <p>Salaamun alaekum ${recipientName},</p>
                  <p>Welcome to Quluub! We are delighted to have you join our community. Our platform is designed to help you find a compatible partner in a way that is secure and aligns with Islamic values.</p>
                  <p>Here are a few steps to get you started:</p>
                  <ul style="padding-left: 20px;">
                    <li>Complete your profile to attract the best matches.</li>
                    <li>Set your preferences to filter your search.</li>
                    <li>Explore profiles and connect with members.</li>
                  </ul>
                  <p>If you have any questions, feel free to visit our FAQ page or contact our support team. May your journey with us be a blessed one.</p>
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

module.exports = welcomeEmail;
