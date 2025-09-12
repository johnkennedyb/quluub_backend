/**
 * Email Footer Component with Abstract Background and Social Media Icons
 * Uses the light abstract background with social media icons overlay
 */

const createEmailFooter = () => {
  return `
    <tr>
      <td
        align="center"
        valign="top"
        class="footer"
        style="padding: 0; background: #f5f5f5; width: 100%;"
      >
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-image: url('https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_1_cocsqj.png'); background-size: cover; background-position: center; background-repeat: no-repeat; min-height: 160px; display: block;">
          <tr>
            <td align="center" valign="middle" style="padding: 25px 20px; width: 100%;">
              <p style="margin: 0 0 15px 0; font-size: 12px; line-height: 18px; color: #333333; font-family: Arial, sans-serif; text-align: center;">
                &copy; 2024 Quluub. All rights reserved.
              </p>
              <!-- Enforce a single row with 5 icons using table columns for maximum email client compatibility -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td align="center" valign="middle" style="padding: 0 6px;">
                    <a href="https://www.facebook.com/Quluubplatform" target="_blank" style="text-decoration:none;">
                      <img src="https://img.icons8.com/color/48/000000/facebook.png" alt="Facebook" width="36" height="36" style="display:block; border:0; width:36px; height:36px;" />
                    </a>
                  </td>
                  <td align="center" valign="middle" style="padding: 0 6px;">
                    <a href="https://x.com/_Quluub?t=hPSL5bi-oVzRu1AnHmyNfA&s=08" target="_blank" style="text-decoration:none;">
                      <img src="https://img.icons8.com/color/48/000000/twitterx.png" alt="X (Twitter)" width="36" height="36" style="display:block; border:0; width:36px; height:36px;" />
                    </a>
                  </td>
                  <td align="center" valign="middle" style="padding: 0 6px;">
                    <a href="https://www.instagram.com/_quluub/profilecard/?igsh=MTNuYnBxMmdmOHE4Mg==" target="_blank" style="text-decoration:none;">
                      <img src="https://img.icons8.com/color/48/000000/instagram-new.png" alt="Instagram" width="36" height="36" style="display:block; border:0; width:36px; height:36px;" />
                    </a>
                  </td>
                  <td align="center" valign="middle" style="padding: 0 6px;">
                    <a href="https://www.youtube.com/@Quluubplatform" target="_blank" style="text-decoration:none;">
                      <img src="https://img.icons8.com/color/48/000000/youtube-play.png" alt="YouTube" width="36" height="36" style="display:block; border:0; width:36px; height:36px;" />
                    </a>
                  </td>
                  <td align="center" valign="middle" style="padding: 0 6px;">
                    <a href="https://www.tiktok.com/@_quluub?_t=8nWc7U4dvDE&_r=1" target="_blank" style="text-decoration:none;">
                      <img src="https://img.icons8.com/color/48/000000/tiktok.png" alt="TikTok" width="36" height="36" style="display:block; border:0; width:36px; height:36px;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <style>
      @media only screen and (max-width: 600px) {
        .footer div {
          width: 100% !important;
          max-width: 100% !important;
        }
        .footer table {
          width: 100% !important;
          max-width: 100% !important;
          min-height: 140px !important;
        }
        .footer td {
          padding: 20px 15px !important;
        }
        .footer img {
          width: 35px !important;
          height: 35px !important;
          margin: 0 6px !important;
        }
        .footer p {
          font-size: 11px !important;
        }
      }
      
      @media only screen and (max-width: 480px) {
        .footer div {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        .footer table {
          width: 100% !important;
          max-width: 100% !important;
          min-height: 120px !important;
        }
        .footer td {
          padding: 15px 10px !important;
        }
        .footer img {
          width: 30px !important;
          height: 30px !important;
          margin: 0 4px !important;
        }
        .footer p {
          font-size: 10px !important;
          line-height: 16px !important;
        }
      }
      
      @media only screen and (max-width: 320px) {
        .footer div {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        .footer table {
          width: 100% !important;
          max-width: 100% !important;
          min-height: 100px !important;
        }
        .footer td {
          padding: 12px 8px !important;
        }
        .footer img {
          width: 28px !important;
          height: 28px !important;
          margin: 0 3px !important;
        }
        .footer p {
          font-size: 9px !important;
          line-height: 14px !important;
        }
      }
    </style>
  `;
};

module.exports = createEmailFooter;
