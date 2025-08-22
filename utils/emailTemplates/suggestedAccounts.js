const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const suggestedAccountsEmail = (recipientName) => {
  const subject = 'Discover Potential Matches on Quluub';
  const title = 'New Suggestions For You';
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
                  We hope you're doing well. We've identified some profiles on Quluub that could be great matches for you. Take a moment to explore them and consider sending a connection request.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333; text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL}/matches" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">View Potential Matches</a>
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

module.exports = suggestedAccountsEmail;
