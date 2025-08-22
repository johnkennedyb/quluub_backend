const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const encourageUnhideEmail = (recipientName) => {
  const subject = 'Your Profile Status Update';
  const title = 'A Friendly Reminder';
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
                  We noticed that your profile on Quluub is currently hidden. Did you know that having an active profile increases your chances of finding meaningful connections?
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Consider unhiding your profile today to start engaging with potential matches.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  If you need any assistance or have questions, please don't hesitate to contact our support team.
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

module.exports = encourageUnhideEmail;
