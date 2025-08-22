/**
 * Email Header Component
 * A simple, clean header for Quluub emails.
 */

const createEmailHeader = (subject = 'Quluub Notification') => {
  return `
    <tr>
      <td
        align="center"
        valign="top"
        class="header"
        style="padding: 40px 10px; background: linear-gradient(135deg, #008080 0%, #f8ae95 100%); background-size: cover; "
      >
        <h1
          style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff; font-family: Arial, sans-serif;"
        >${subject}</h1>
      </td>
    </tr>
  `;
};

module.exports = createEmailHeader;
