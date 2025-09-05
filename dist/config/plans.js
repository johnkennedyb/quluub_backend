// User plan configurations for messaging and features
const plans = {
  freemium: {
    messageAllowance: 10, // 10 messages per match permanently
    wordCountPerMessage: 50,
    videoCall: false
  },
  premium: {
    messageAllowance: 10, // 10 messages per match permanently
    wordCountPerMessage: 100,
    videoCall: true
  },
  pro: {
    messageAllowance: 10, // 10 messages per match permanently
    wordCountPerMessage: 150,
    videoCall: true
  }
};

module.exports = { plans };
