/**
 * Sample Email Template using new Header and Footer components
 * This demonstrates how to use the new abstract background designs
 */

const createEmailHeader = require('./components/emailHeader');
const createEmailFooter = require('./components/emailFooter');

const sampleEmailWithNewDesign = (recipientName, subject = 'Welcome to Quluub!', content = '') => {
  const defaultContent = `
    <div style="
      background: white;
      padding: 40px 30px;
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #374151;
    ">
      <h2 style="
        color: #14b8a6;
        font-size: 24px;
        margin-bottom: 20px;
        text-align: center;
      ">
        Assalamu Alaikum ${recipientName}!
      </h2>
      
      <p style="font-size: 16px; margin-bottom: 20px;">
        Welcome to Quluub, where hearts connect and futures are built together in accordance with Islamic values.
      </p>
      
      <div style="
        background: #f0fdfa;
        border-left: 4px solid #14b8a6;
        padding: 20px;
        margin: 20px 0;
        border-radius: 0 8px 8px 0;
      ">
        <p style="margin: 0; font-style: italic; color: #0f766e;">
          "And among His signs is that He created for you mates from among yourselves, 
          that you may dwell in tranquility with them, and He has put love and mercy between your hearts."
          <br><strong>- Quran 30:21</strong>
        </p>
      </div>
      
      <p style="font-size: 16px; margin-bottom: 20px;">
        Your journey to finding your perfect match begins here. May Allah bless your search and guide you to what's best for your Deen and Dunya.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://app.quluub.com" style="
          background: linear-gradient(135deg, #14b8a6, #0f766e);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 25px;
          font-weight: 600;
          display: inline-block;
          box-shadow: 0 4px 15px rgba(20, 184, 166, 0.3);
          transition: transform 0.2s;
        ">
          Get Started on Quluub
        </a>
      </div>
      
      <p style="font-size: 14px; color: #6b7280; text-align: center;">
        Barakallahu feeki/feeka,<br>
        <strong>The Quluub Team</strong>
      </p>
    </div>
  `;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="
      margin: 0;
      padding: 0;
      background-color: #f9fafb;
      font-family: 'Arial', sans-serif;
    ">
      <div style="
        max-width: 600px;
        margin: 0 auto;
        background: white;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        border-radius: 10px;
        overflow: hidden;
      ">
        ${createEmailHeader(subject)}
        ${content || defaultContent}
        ${createEmailFooter()}
      </div>
    </body>
    </html>
  `;

  return {
    subject,
    html
  };
};

module.exports = sampleEmailWithNewDesign;
