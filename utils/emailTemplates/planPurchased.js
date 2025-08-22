const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const planPurchasedEmail = (recipientName) => {
  const subject = 'Welcome to Quluub Premium!';
  const title = 'Welcome to Premium!';
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
                  Congratulations on purchasing the Premium Plan! You can now send up to 5 connection requests per month, enjoy an ad-free experience, and make video calls with your matched connections.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Thank you for upgrading!
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

module.exports = planPurchasedEmail;
