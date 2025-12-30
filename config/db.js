const mongoose = require('mongoose');

const connectDB = async () => {
  const useSql = process.env.SQL_ENABLED === 'true';

  if (useSql) {
    try {
      const { initSqlPool } = require('./sql');
      await initSqlPool();
      console.log('MySQL pool initialized');
    } catch (sqlErr) {
      console.error('Failed to initialize MySQL pool:', sqlErr?.message || sqlErr);
    }
  }

  try {
    if (!process.env.MONGODB_URI) {
      if (!useSql) {
        console.warn('MONGODB_URI not set. Skipping Mongo connection.');
      }
      return;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxIdleTimeMS: 30000,
      bufferCommands: false,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    if (!useSql) {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
