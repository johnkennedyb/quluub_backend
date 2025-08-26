/**
 * Email Header Component
 * Header with background image for Quluub emails.
 */

const createEmailHeader = (subject = 'Quluub Notification', recipientName = '') => {
  return `
    <tr>
      <td
        align="center"
        valign="top"
        class="header"
        style="
          padding: 0;
          background: #008080;
          width: 100%;
        "
      >
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-image: url('https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_rpw2wq.png'); background-size: cover; background-position: center; background-repeat: no-repeat; min-height: 150px;">
          <tr>
            <td align="center" valign="middle" style="padding: 40px 10px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff; font-family: Arial, sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                ${subject}
              </h1>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
};

module.exports = createEmailHeader;
