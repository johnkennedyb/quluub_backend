/**
 * Simple Email Footer Component
 * Clean and minimal design matching the reverted header style
 */

const createEmailFooter = () => {
  return `
    <div style="
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e9ecef;
      margin-top: 20px;
    ">
      <p style="
        color: #6c757d;
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin: 0 0 10px 0;
        line-height: 1.5;
      ">
        © 2024 Quluub - Connecting Hearts, Building Futures
      </p>
      <p style="
        color: #6c757d;
        font-family: Arial, sans-serif;
        font-size: 11px;
        margin: 0;
        line-height: 1.4;
      ">
        This email was sent to you because you have an account with Quluub.<br>
        If you no longer wish to receive these emails, please contact support@quluub.com
      </p>
    </div>
  `;
};

module.exports = createEmailFooter;
