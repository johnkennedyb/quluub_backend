const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const pendingRequestsEmail = (recipientName, requestCount) => {
  const subject = 'Pending Connection Requests Awaiting Your Response';
  const title = 'Pending Requests';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${recipientName},</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  You have ${requestCount} new connection requests waiting for your response on Quluub.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Please take a moment to review these requests and either accept or decline them.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  May Allaah guide you in making the best decision.
                </p>
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

module.exports = pendingRequestsEmail;
