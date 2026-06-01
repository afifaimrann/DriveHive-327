import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

/**
 * GET /health
 * Simple health check API endpoint, testing database connectivity.
 */
router.get('/health', async (req, res) => {
  let dbStatus = 'healthy';
  let dbError = null;

  try {
    // Perform a fast query to verify database connectivity
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      dbStatus = 'unhealthy';
      dbError = error.message;
    }
  } catch (err) {
    dbStatus = 'unhealthy';
    dbError = err.message;
  }

  const statusCode = dbStatus === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status: dbStatus === 'healthy' ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: {
        status: dbStatus,
        ...(dbError ? { error: dbError } : {}),
      },
    },
  });
});

export default router;
