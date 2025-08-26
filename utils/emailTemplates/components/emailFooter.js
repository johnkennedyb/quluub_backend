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
        style="padding: 0; background: #f5f5f5;"
      >
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-image: url('https://res.cloudinary.com/djx3ijal6/image/upload/v1756137463/Copy_of_Quluub_Email_Header_1_cocsqj.png'); background-size: cover; background-position: center; background-repeat: no-repeat; min-height: 200px;">
          <tr>
            <td align="center" valign="middle" style="padding: 30px 10px;">
              <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 18px; color: #333333; font-family: Arial, sans-serif;">
                &copy; 2024 Quluub. All rights reserved.
              </p>
              <table
                border="0"
                cellpadding="0"
                cellspacing="0"
                width="100%"
              >
                <tr>
                  <td align="center" colspan="5">
                    <a
                      href="https://www.facebook.com/Quluubplatform"
                      target="_blank"
                    >
                      <img
                        src="https://img.icons8.com/color/48/000000/facebook.png"
                        alt="Facebook"
                        style="display: inline-block; border: 0; margin: 0 10px;"
                      />
                    </a>
                    <a
                      href="https://x.com/_Quluub?t=hPSL5bi-oVzRu1AnHmyNfA&s=08"
                      target="_blank"
                    >
                      <img
                        src="https://img.icons8.com/color/48/000000/twitterx.png"
                        alt="Twitter"
                        style="display: inline-block; border: 0; margin: 0 10px;"
                      />
                    </a>
                    <a
                      href="https://www.instagram.com/_quluub/profilecard/?igsh=MTNuYnBxMmdmOHE4Mg=="
                      target="_blank"
                    >
                      <img
                        src="https://img.icons8.com/color/48/000000/instagram-new.png"
                        alt="Instagram"
                        style="display: inline-block; border: 0; margin: 0 10px;"
                      />
                    </a>
                    <a
                      href="https://www.youtube.com/@Quluubplatform"
                      target="_blank"
                    >
                      <img
                        src="https://img.icons8.com/color/48/000000/youtube-play.png"
                        alt="YouTube"
                        style="display: inline-block; border: 0; margin: 0 10px;"
                      />
                    </a>
                    <a
                      href="https://www.tiktok.com/@_quluub?_t=8nWc7U4dvDE&_r=1"
                      target="_blank"
                    >
                      <img
                        src="https://img.icons8.com/color/48/000000/tiktok.png"
                        alt="TikTok"
                        style="display: inline-block; border: 0; margin: 0 10px;"
                      />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
};

module.exports = createEmailFooter;
