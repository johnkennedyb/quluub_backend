const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

let redisClient;
let isRedisReady = false;

const initializeRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: {
        connectTimeout: 5000, // 5-second timeout for connection attempts
      },
    });

    redisClient.on('error', (err) => {
      if (isRedisReady) {
        console.error('Redis Client Error:', err);
        isRedisReady = false; // Mark as not ready on error
      }
    });

    await redisClient.connect();
    console.log('Connected to Redis');
    isRedisReady = true;

  } catch (err) {
    console.warn('\n--- REDIS WARNING ---\nCould not connect to Redis. Caching will be disabled.\nMake sure Redis is running on port 6379 if you need caching.\n---------------------\n');
    // Create a mock client if connection fails
    redisClient = {
      get: async () => null,
      set: async () => null,
      on: () => {},
      connect: async () => {},
      isReady: false,
    };
    isRedisReady = false;
  }
};

initializeRedis();

const cacheMiddleware = (duration) => async (req, res, next) => {
  if (!isRedisReady) {
    res.setHeader('X-Cache', 'DISABLED');
    return next();
  }

  const key = '__express__' + req.originalUrl || req.url;

  try {
    const cachedResponse = await redisClient.get(key);

    if (cachedResponse) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Cache', 'HIT');
      return res.send(JSON.parse(cachedResponse));
    }

    res.setHeader('X-Cache', 'MISS');
    const originalSend = res.send;
    res.send = (body) => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.set(key, body, { EX: duration });
        }
      } catch (err) {
        console.error('Error saving to cache:', err);
      }
      originalSend.call(res, body);
    };

    next();
  } catch (err) {
    console.error('Cache middleware error:', err);
    next();
  }
};

module.exports = { redisClient, cache: cacheMiddleware };
