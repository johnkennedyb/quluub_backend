/**
 * Email Footer Component with background image and social icons
 * Matches the design with teal/orange abstract background
 */

const createEmailFooter = () => {
  return `
    <div style="
      background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDYwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI2MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+CjxwYXRoIGQ9Ik0wLDAgTDEwMCwwIEMxNTAsMCAxNTAsNTAgMjAwLDUwIEwxNDUsMTAwIEMxMjAsMTIwIDgwLDEyMCA1NSwxMDAgTDAsNTAgWiIgZmlsbD0iI2ZmNjYzMyIgb3BhY2l0eT0iMC43Ii8+CjxwYXRoIGQ9Ik02MDAsMCBMNTAwLDAgQzQ1MCwwIDQ1MCw1MCA0MDAsNTAgTDQ1NSwxMDAgQzQ4MCwxMjAgNTIwLDEyMCA1NDUsMTAwIEw2MDAsNTAgWiIgZmlsbD0iI2ZmYjhhNyIgb3BhY2l0eT0iMC42Ii8+CjxwYXRoIGQ9Ik0wLDIwMCBMMTAwLDIwMCBDMTUwLDIwMCAxNTAsMTUwIDIwMCwxNTAgTDE0NSwxMDAgQzEyMCw4MCA4MCw4MCA1NSwxMDAgTDAsMTUwIFoiIGZpbGw9IiNmZmI4YTciIG9wYWNpdHk9IjAuNSIvPgo8cGF0aCBkPSJNNDAwLDIwMCBMNTAwLDIwMCBDNTUwLDIwMCA1NTAsMTUwIDYwMCwxNTAgTDU0NSwxMDAgQzUyMCw4MCA0ODAsODAgNDU1LDEwMCBMNDAwLDE1MCBaIiBmaWxsPSIjMDA4MDgwIiBvcGFjaXR5PSIwLjQiLz4KPC9zdmc+');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      padding: 30px 20px;
      text-align: center;
      margin-top: 20px;
    ">
      <div style="margin-bottom: 20px;">
        <span style="
          background-color: #ffd700;
          color: #000;
          padding: 4px 8px;
          border-radius: 4px;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: bold;
        ">Quluub</span>
      </div>
      
      <p style="
        color: #333;
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin: 0 0 5px 0;
        line-height: 1.5;
      ">
        © 2024 <span style="background-color: #ffd700; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold;">Quluub</span>. All rights reserved.
      </p>
      
      <p style="
        color: #666;
        font-family: Arial, sans-serif;
        font-size: 11px;
        margin: 0 0 20px 0;
        line-height: 1.4;
      ">
        1234 Street Rd, Suite 1234, City
      </p>
      
      <div style="margin: 20px 0;">
        <a href="https://facebook.com/quluub" style="display: inline-block; margin: 0 8px; text-decoration: none;">
          <div style="width: 40px; height: 40px; background-color: #1877f2; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 18px;">f</span>
          </div>
        </a>
        <a href="https://twitter.com/quluub" style="display: inline-block; margin: 0 8px; text-decoration: none;">
          <div style="width: 40px; height: 40px; background-color: #000; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 16px;">X</span>
          </div>
        </a>
        <a href="https://instagram.com/quluub" style="display: inline-block; margin: 0 8px; text-decoration: none;">
          <div style="width: 40px; height: 40px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 16px;">📷</span>
          </div>
        </a>
        <a href="https://youtube.com/quluub" style="display: inline-block; margin: 0 8px; text-decoration: none;">
          <div style="width: 40px; height: 40px; background-color: #ff0000; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 16px;">▶</span>
          </div>
        </a>
        <a href="https://tiktok.com/@quluub" style="display: inline-block; margin: 0 8px; text-decoration: none;">
          <div style="width: 40px; height: 40px; background-color: #000; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 16px;">🎵</span>
          </div>
        </a>
      </div>
    </div>
  `;
};

module.exports = createEmailFooter;
