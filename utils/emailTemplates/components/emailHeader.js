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
        style="padding: 0; background-color: #008080;"
        background="https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_rpw2wq.png"
      >
        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:175px;">
          <v:fill type="tile" src="https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_rpw2wq.png" color="#008080" />
          <v:textbox inset="0,0,0,0">
        <![endif]-->
        <div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" valign="middle" style="padding: 40px 10px; min-height: 150px;">
                <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff; font-family: Arial, sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                  ${subject}
                </h1>
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
  `;
};

module.exports = createEmailHeader;
