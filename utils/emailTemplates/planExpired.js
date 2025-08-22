const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const planExpiredEmail = (recipientName) => {
  const subject = 'Action Required: Your Quluub Premium Plan Has Expired';
  const title = 'Your Plan Has Expired';
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
                  We hope this message finds you well. We wanted to inform you that your Quluub Premium Plan has expired. To continue enjoying our premium features, including sending up to 5 connection requests per month and an ad-free experience, please consider renewing your plan.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Renew your plan now to stay connected effortlessly!
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

module.exports = planExpiredEmail;
