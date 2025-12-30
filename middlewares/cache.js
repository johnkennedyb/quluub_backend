// Simple in-memory cache middleware
const cache = {};

const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = req.originalUrl || req.url;
    const cachedResponse = cache[key];

    if (cachedResponse && (Date.now() - cachedResponse.timestamp) < duration * 1000) {
      console.log(`Cache hit for ${key}`);
      return res.json(cachedResponse.data);
    }

    // Store original res.json
    const originalJson = res.json;

    // Override res.json to cache the response
    res.json = function(data) {
      cache[key] = {
        data: data,
        timestamp: Date.now()
      };
      console.log(`Cache set for ${key}`);
      return originalJson.call(this, data);
    };

    next();
  };
};

module.exports = cacheMiddleware;
