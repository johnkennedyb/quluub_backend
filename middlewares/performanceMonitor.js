/**
 * Performance Monitoring Middleware
 * Tracks API response times, database query performance, and system metrics
 */

const os = require('os');

// Performance metrics storage
const performanceMetrics = {
  requests: [],
  slowQueries: [],
  systemMetrics: {
    lastUpdated: Date.now(),
    cpuUsage: 0,
    memoryUsage: 0,
    uptime: 0
  }
};

/**
 * Request performance tracking middleware
 */
const trackRequestPerformance = (req, res, next) => {
  const startTime = Date.now();
  const startHrTime = process.hrtime();

  // Override res.json to capture response time
  const originalJson = res.json;
  res.json = function(data) {
    const endTime = Date.now();
    const diff = process.hrtime(startHrTime);
    const responseTime = diff[0] * 1000 + diff[1] * 1e-6; // Convert to milliseconds

    // Log slow requests (>1000ms)
    if (responseTime > 1000) {
      console.warn(`🐌 Slow request detected: ${req.method} ${req.originalUrl} - ${responseTime.toFixed(2)}ms`);
    }

    // Store performance metrics (keep last 100 requests)
    if (process.env.ENABLE_PERFORMANCE_LOGGING === 'true') {
      performanceMetrics.requests.push({
        method: req.method,
        url: req.originalUrl,
        responseTime: Math.round(responseTime),
        statusCode: res.statusCode,
        timestamp: endTime,
        userAgent: req.get('User-Agent')?.substring(0, 50),
        ip: req.ip
      });

      // Keep only last 100 requests
      if (performanceMetrics.requests.length > 100) {
        performanceMetrics.requests = performanceMetrics.requests.slice(-100);
      }
    }

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Database query performance tracker
 */
const trackDatabasePerformance = (queryName, startTime) => {
  return (error, result) => {
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // Log slow queries (>500ms)
    if (queryTime > 500) {
      console.warn(`🐌 Slow database query: ${queryName} - ${queryTime}ms`);
      
      if (process.env.ENABLE_PERFORMANCE_LOGGING === 'true') {
        performanceMetrics.slowQueries.push({
          queryName,
          queryTime,
          timestamp: endTime,
          error: error ? error.message : null
        });

        // Keep only last 50 slow queries
        if (performanceMetrics.slowQueries.length > 50) {
          performanceMetrics.slowQueries = performanceMetrics.slowQueries.slice(-50);
        }
      }
    }

    return { error, result, queryTime };
  };
};

/**
 * Update system metrics
 */
const updateSystemMetrics = () => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  performanceMetrics.systemMetrics = {
    lastUpdated: Date.now(),
    memoryUsage: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    },
    cpuUsage: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    uptime: Math.round(process.uptime()),
    loadAverage: os.loadavg(),
    freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
    totalMemory: Math.round(os.totalmem() / 1024 / 1024) // MB
  };
};

/**
 * Get performance metrics
 */
const getPerformanceMetrics = () => {
  updateSystemMetrics();
  
  const recentRequests = performanceMetrics.requests.slice(-20);
  const avgResponseTime = recentRequests.length > 0 
    ? Math.round(recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length)
    : 0;

  return {
    summary: {
      totalRequests: performanceMetrics.requests.length,
      averageResponseTime: avgResponseTime,
      slowQueries: performanceMetrics.slowQueries.length,
      uptime: performanceMetrics.systemMetrics.uptime
    },
    recentRequests: recentRequests.map(req => ({
      method: req.method,
      url: req.url,
      responseTime: req.responseTime,
      statusCode: req.statusCode,
      timestamp: new Date(req.timestamp).toISOString()
    })),
    slowQueries: performanceMetrics.slowQueries.slice(-10).map(query => ({
      queryName: query.queryName,
      queryTime: query.queryTime,
      timestamp: new Date(query.timestamp).toISOString(),
      error: query.error
    })),
    systemMetrics: performanceMetrics.systemMetrics
  };
};

/**
 * Performance monitoring endpoint
 */
const performanceEndpoint = (req, res) => {
  try {
    const metrics = getPerformanceMetrics();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving performance metrics'
    });
  }
};

/**
 * Health check endpoint
 */
const healthCheckEndpoint = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Basic system health
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      memory: {
        heapUsedPercent: Math.round(heapUsedPercent),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024)
      },
      version: process.version,
      environment: process.env.NODE_ENV
    };

    // Mark as unhealthy if critical issues
    if (dbStatus !== 'connected' || heapUsedPercent > 90) {
      health.status = 'unhealthy';
      res.status(503);
    }

    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
};

// Update system metrics every 30 seconds
setInterval(updateSystemMetrics, 30000);

module.exports = {
  trackRequestPerformance,
  trackDatabasePerformance,
  getPerformanceMetrics,
  performanceEndpoint,
  healthCheckEndpoint,
  updateSystemMetrics
};
