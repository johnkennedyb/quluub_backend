const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliViewChatEmail = (waliName, wardName, brotherName, chatLink) => {
  const subject = 'Notification: Your Ward is Chatting on Quluub';
  const title = 'Your Ward is Chatting';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px; font-family: Arial, sans-serif; font-size:16px; color:#333; line-height:1.6;">
                <p>Salaamun alaekum ${waliName},</p>
                <p>We wanted to inform you that your ward, ${wardName}, is currently chatting with ${brotherName} on Quluub. As her guardian, you can view the conversation through the following link, and we have also attached the complete chat transcript files (PDF and TXT formats) to this email for your review:</p>
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${chatLink}" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">View Chat</a>
                </p>
                <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="color: #2d5a2d; margin: 0; font-size: 14px;">
                    <strong>📎 Attachments:</strong> This email includes chat transcript files in both PDF and TXT formats for your convenience and record-keeping.
                  </p>
                </div>
                <p>Thank you for your attention to this matter.</p>
              </td>
            </tr>
            ${emailFooterWithIcons}
          </table>
        </td>
      </tr>
    </table>
  `;

  return { subject, html };
};

module.exports = waliViewChatEmail;
