const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const contactWaliEmail = (brotherName) => {
  const subject = 'Important: Contact the Wali';
  const title = 'Contact the Wali';
  const html = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
            ${emailHeader(title)}
            <tr>
              <td style="padding:30px;">
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">Salaamun alaekum ${brotherName},</p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  As you engage in conversations on Quluub, please remember that it's essential to contact the Wali (guardian) of the sister you're chatting with. This ensures respectful and appropriate communication in line with Islamic principles.
                </p>
                <p style="font-family: Arial, sans-serif; font-size:16px; color:#333;">
                  Please reach out to the sister's Wali.
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

module.exports = contactWaliEmail;
