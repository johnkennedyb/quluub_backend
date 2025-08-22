const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const waliNewJoinerEmail = (waliName, sisterName) => {
  const subject = 'Notification: Your Ward Has Joined Quluub';
  const title = 'Your Ward Joined Quluub';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${waliName},</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  We hope this message finds you in the best of health and iman. We are writing to inform you that your ward, ${sisterName}, has recently joined Quluub, our comprehensive platform designed to assist with marriage and family-related services.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  As a valued guardian, we understand the importance of your role in her journey. Rest assured that Quluub is committed to providing a secure and supportive environment that upholds Islamic values.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  If you have any questions or need further information, please do not hesitate to contact us. We are here to support you and your ward throughout this process.
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

module.exports = waliNewJoinerEmail;
