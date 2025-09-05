const zoomConfig = {
  // Zoom SDK Credentials
  SDK_KEY: process.env.ZOOM_SDK_KEY || 'GHjLXTPUZv9hAtesC8bt9ADDega3qV56aPdh',
  SDK_SECRET: process.env.ZOOM_SDK_SECRET || 'qxj4uCkFVd3W1tvtZnagbuTvo31kOcXz5N7y',
  
  // Zoom API Credentials
  API_KEY: process.env.ZOOM_API_KEY || 'xO1VYDPwScOmsnNN3CkkuQ',
  API_SECRET: process.env.ZOOM_API_SECRET || 'Eg6W8odLNcGkZhZ4z6m8gZoH1ZJlJmqcxrOf',
  
  // Zoom Webhook Tokens
  SECRET_TOKEN: process.env.ZOOM_SECRET_TOKEN || '02VAnUbtTny7Qku1md-lpQ',
  VERIFICATION_TOKEN: process.env.ZOOM_VERIFICATION_TOKEN || 'K9Tnwzk2SUeN4ksQ0_G6KQ',
  
  // Meeting Configuration
  MEETING_DURATION: 5, // 5 minutes maximum
  AUTO_RECORDING: true,
  CLOUD_RECORDING: true,
  
  // API Base URL
  API_BASE_URL: 'https://api.zoom.us/v2'
};

module.exports = zoomConfig;
