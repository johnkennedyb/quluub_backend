const axios = require('axios');

// Maileroo API configuration
const MAILEROO_API_KEY = 'fdfbe57cf3c414c1d6d5959b948aee7794ab8d742ef6be681ef15bbf78dd201b';
const MAILEROO_API_URL = 'https://smtp.maileroo.com/api/v2/emails';

/**
 * Send email using Maileroo API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {string} from - Sender email (optional)
 * @returns {Promise<boolean>} - Success status
 */
const sendEmailViaAPI = async (to, subject, html, from = 'mail@quluub.com') => {
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
