const footer = require('./footer');

const welcomeEmail = (recipientName) => {
  const subject = 'Welcome to Quluub - Your Journey Begins!';
  const html = `
  `;

  return {
    subject,
    html: `
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center" bgcolor="#f4f4f4">
                <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px;">
                  ${header}
                  ${body}
                  ${footer}
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
};

module.exports = welcomeEmail;
