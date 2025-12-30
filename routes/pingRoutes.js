const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// @desc    Hard ping database connection
// @route   GET /api/ping/db
// @access  Public
const pingDatabase = async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Force a database operation to test connectivity
    await mongoose.connection.db.admin().ping();
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    res.json({
      success: true,
      message: 'Database connection active',
      latency: `${latency}ms`,
      timestamp: new Date().toISOString(),
      connectionState: mongoose.connection.readyState,
      connectionStates: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }
    });
  } catch (error) {
    console.error('Database ping failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database ping failed',
      error: error.message,
      timestamp: new Date().toISOString(),
      connectionState: mongoose.connection.readyState
    });
  }
};

// @desc    Get detailed database status
// @route   GET /api/ping/db/status
// @access  Public
const getDatabaseStatus = async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Multiple database operations to test thoroughly
    const [pingResult, statsResult] = await Promise.all([
      mongoose.connection.db.admin().ping(),
      mongoose.connection.db.stats()
    ]);
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    res.json({
      success: true,
      ping: {
        latency: `${latency}ms`,
        timestamp: new Date().toISOString()
      },
      connection: {
        state: mongoose.connection.readyState,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      },
      stats: {
        collections: statsResult.collections,
        dataSize: statsResult.dataSize,
        indexSize: statsResult.indexSize,
        storageSize: statsResult.storageSize
      }
    });
  } catch (error) {
    console.error('Database status check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database status check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

router.get('/db', pingDatabase);
router.get('/db/status', getDatabaseStatus);

module.exports = router;
