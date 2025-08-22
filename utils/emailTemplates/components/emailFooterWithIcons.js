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
        style="padding: 30px 10px; background: linear-gradient(135deg, #008080 0%, #f8ae95 100%); background-size: cover;"
      >
        <p
          style="margin: 0; font-size: 12px; line-height: 18px; color: #ffffff; font-family: Arial, sans-serif;"
        >
          &copy; 2024 Quluub. All rights reserved.<br />
          123 Quluub Street, Matrimony City, MC 45678
        </p>
        <table
          border="0"
          cellpadding="0"
          cellspacing="0"
          width="100%"
          style="margin-top: 20px;"
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
  `;
};

module.exports = createEmailFooter;
