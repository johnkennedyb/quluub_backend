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
        style="padding: 0; background-color: #008080; background-image: url('https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_rpw2wq.png'); background-size: cover; background-position: center; background-repeat: no-repeat;"
      >
        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:100%;height:auto;min-height:150px;">
          <v:fill type="tile" src="https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_rpw2wq.png" color="#008080" />
          <v:textbox inset="0,0,0,0">
        <![endif]-->
        <div style="width: 100%; max-width: 600px; margin: 0 auto;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
            <tr>
              <td align="center" valign="middle" style="padding: 30px 20px; min-height: 120px;">
                <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #ffffff; font-family: Arial, sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); line-height: 1.3; text-align: center;">
                  ${subject}
                </h1>
                ${recipientName ? `<p style="margin: 10px 0 0 0; font-size: 16px; color: #ffffff; font-family: Arial, sans-serif; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Dear ${recipientName}</p>` : ''}
              </td>
            </tr>
          </table>
        </div>
        <!--[if gte mso 9]>
          </v:textbox>
        </v:rect>
        <![endif]-->
      </td>
    </tr>
    <style>
      @media only screen and (max-width: 600px) {
        .header h1 {
          font-size: 18px !important;
          padding: 0 10px !important;
        }
        .header td {
          padding: 20px 15px !important;
        }
      }
    </style>
  `;
};

module.exports = createEmailHeader;
