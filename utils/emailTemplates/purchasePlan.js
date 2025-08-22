const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const purchasePlanEmail = (recipientName) => {
  const subject = 'Unlock Exclusive Features with Our Premium Plan!';
  const title = 'Go Premium!';
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
                  Elevate your experience on Quluub with our exclusive Premium Plan. Enjoy a higher number of monthly requests, an ad-free experience, video calling with your matches, and more opportunities to connect.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Upgrade today and start making meaningful connections!
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

module.exports = purchasePlanEmail;
