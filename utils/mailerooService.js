const axios = require('axios');

// Maileroo API configuration
const MAILEROO_API_KEY = 'adfdb8d27860fc0cb06b4962fcd75ee1ffc73e1ba6a6320f2db7f0fd1775e900';
const MAILEROO_API_URL = 'https://smtp.maileroo.com/api/v2/emails';

/**
 * Send email using Maileroo API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {string} from - Sender email (optional)
 * @returns {Promise<boolean>} - Success status
 */
const sendEmailViaAPI = async (to, subject, html, from = 'mail@match.quluub.com') => {
  try {
    console.log(`Sending email via Maileroo API to: ${to}`);
    
    const response = await axios.post(MAILEROO_API_URL, {
      from: {
        address: from,
        display_name: 'Quluub Team'
      },
      to: [{
        address: to
      }],
      subject: subject,
      html: html
    }, {
      headers: {
        'X-API-Key': MAILEROO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('✅ Email sent successfully via Maileroo API');
      console.log('Response:', response.data);
      return true;
    } else {
      console.error('❌ Failed to send email via Maileroo API:', response.status, response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending email via Maileroo API:', error.response?.data || error.message);
    return false;
  }
};

module.exports = {
  sendEmailViaAPI
};
