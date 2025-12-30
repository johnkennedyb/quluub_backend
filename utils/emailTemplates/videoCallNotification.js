const emailHeader = require('./components/emailHeader');
const emailFooterWithIcons = require('./components/emailFooterWithIcons');

const videoCallNotificationEmail = (waliName, wardName, brotherName, callDetails, reportLink) => {
  const callTime = new Date(callDetails.timestamp).toLocaleString();
  const subject = 'Video Call Activity Report - Quluub';
  const title = '📹 Video Call Report';
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        @media screen and (max-width: 600px) {
          .container {
            width: 100% !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
        <!-- Header -->
        ${emailHeader(title)}

        <!-- Body -->
        <tr>
          <td align="center" style="padding: 0 10px;">
            <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff;">
              <tr>
                <td style="padding:30px; font-family: Arial, sans-serif; font-size:16px; color:#333; line-height:1.6;">
                  <p>Assalamu Alaikum ${waliName},</p>
                  <p>This is to inform you that your ward, <strong>${wardName}</strong>, has had a video call with <strong>${brotherName}</strong> on our platform. The call has been recorded for your review and oversight.</p>
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #075e54;">
                        <h3 style="color: #075e54; margin-top: 0;">📋 Call Details:</h3>
                        <p style="margin: 5px 0; color: #333;"><strong>Caller:</strong> ${callDetails.callerName}</p>
                        <p style="margin: 5px 0; color: #333;"><strong>Recipient:</strong> ${callDetails.recipientName}</p>
                        <p style="margin: 5px 0; color: #333;"><strong>Call Time:</strong> ${callTime}</p>
                        <p style="margin: 5px 0; color: #333;"><strong>Call ID:</strong> ${callDetails.callId}</p>
                        ${callDetails.recordingUrl ? `<p style="margin: 5px 0; color: #333;"><strong>📹 Recording:</strong> <a href="${callDetails.recordingUrl}" style="color: #075e54;">View Recording</a></p>` : '<p style="margin: 5px 0; color: #666;"><em>Recording will be available shortly</em></p>'}
                      </td>
                    </tr>
                  </table>
                  
                  <p>As part of our Islamic compliance and Wali oversight system, all video calls are automatically recorded and sent to guardians to ensure proper supervision and maintain Islamic values. You can review the recording using the link above.</p>
                  
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${reportLink}" style="background-color: #075e54; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">📊 View Full Report</a>
                  </p>
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                    <tr>
                      <td style="background-color: #e8f5e8; padding: 15px; border-radius: 8px;">
                        <p style="color: #2d5a2d; margin: 0; font-size: 14px;">
                          <strong>🛡️ Islamic Compliance:</strong> All interactions on Quluub are monitored to ensure they align with Islamic values and provide proper supervision for our community members.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="font-size: 14px;">If you have any concerns or questions about this video call activity, please contact our support team immediately.</p>
                  
                  <p style="font-size: 14px;">
                    If the button doesn't work, copy and paste this link in your browser:<br>
                    <a href="${reportLink}" style="color: #075e54; word-break: break-all;">${reportLink}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center">
            <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;">
               ${emailFooterWithIcons}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  return { subject, html };
};

module.exports = videoCallNotificationEmail;
