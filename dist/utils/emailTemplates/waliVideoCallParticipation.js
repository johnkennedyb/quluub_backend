const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliVideoCallParticipationEmail = (waliFirstName, wardName, brotherName, supportEmailLink) => {
  const subject = 'Notification: Your Ward Has Participated in a Video Call on Quluub';
  const title = 'Video Call Update';
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        @media screen and (max-width: 600px) {
          .container { width: 100% !important; }
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#f5f5f5;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
        ${emailHeader(title)}
        <tr>
          <td align="center" style="padding:0 10px;">
            <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
              <tr>
                <td style="padding:30px; font-family: Arial, sans-serif; font-size:16px; color:#333; line-height:1.6;">
                  <p>Salaamun alaekum ${waliFirstName || 'Guardian'},</p>
                  <p>We wanted to inform you that your ward, <strong>${wardName}</strong>, has recently participated in a video call with <strong>${brotherName}</strong> on Quluub. This feature allows members to communicate briefly while maintaining modesty and adhering to Islamic values.</p>
                  <p>If you have any questions or concerns, please feel free to contact our support team at <a href="${supportEmailLink}" style="color:#075e54;">support@quluub.com</a>. We are committed to maintaining a secure and value-based environment for every member.</p>
                  <p style="margin-top:30px;">JazaakumuLlahu khairan,<br/>The Quluub Team<br/><span style="color:#666;">Where every heart finds a home.</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
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

module.exports = waliVideoCallParticipationEmail;
