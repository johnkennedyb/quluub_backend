const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const welcomeEmail = (recipientName) => {
  const subject = 'Welcome to Quluub!';
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
                  <p>Dear ${recipientName},</p>
                  <p>Salaamun alaekum</p>
                  <p>Welcome to Quluub! We are delighted to have you join our community.</p>
                  <p>Your subscription opens the door to a platform dedicated to helping you find a compatible partner while upholding our shared values. Start exploring profiles, connect with like-minded individuals, and take the next step towards a fulfilling marriage.</p>
                  <p>If you have any questions or need assistance, our support team is here to help.</p>
                  <p>You can join our WhatsApp community by clicking the link below:</p>
                  <p><a href="https://whatsapp.com/channel/0029VaqaEwjL7UVYhsQind1M" style="color:#075e54; text-decoration:underline;">https://whatsapp.com/channel/0029VaqaEwjL7UVYhsQind1M</a></p>
                  <p>May Allaah bless you on this journey.</p>
                  <p>JazaakumuLlahu khairan,<br/>The Quluub Team<br/><span style="opacity:0.9;">Where every heart finds a home.</span></p>
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
