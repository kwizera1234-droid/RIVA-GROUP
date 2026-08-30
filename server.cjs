const express = require('express');
const { analyzeTelemetry, isConfigured, model } = require('./services/gemini.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware: JSON body parsing, manual CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.VITE_BACKEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

//
// Health check
//
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SoberWatch backend is running' });
});

//
// AI Status endpoint
//
app.get('/api/ai/status', (req, res) => {
  try {
    const configured = Boolean(process.env.GEMINI_API_KEY);
    let status = 'ready';
    let provider = 'gemini';

    if (!configured) {
      status = 'unavailable';
    }

    res.json({
      configured,
      provider,
      model: configured ? model : null,
      status
    });
  } catch (err) {
    console.error('[AI Status] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//
// AI Analyze endpoint
//
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { bac, heartRate, spo2, temperature, drivingReady, recentReadings } = req.body || {};

    // Input validation: ensure we have some data to analyze
    const hasData = bac !== undefined || heartRate !== undefined || spo2 !== undefined ||
                   temperature !== undefined || drivingReady !== undefined || (recentReadings && recentReadings.length > 0);

    if (!hasData) {
      return res.status(400).json({
        summary: 'Insufficient telemetry data for analysis.',
        riskLevel: 'LOW',
        drivingRecommendation: 'unknown',
        keyFindings: [],
        recommendations: [],
        confidence: 0
      });
    }

    // Prevent duplicate simultaneous AI requests using a simple in-process lock
    if (global._aiRequestInProgress) {
      return res.status(429).json({
        error: 'AI analysis already in progress. Please wait for the current request to complete.',
        summary: 'Analysis in progress',
        riskLevel: 'LOW',
        drivingRecommendation: 'unknown',
        keyFindings: [],
        recommendations: [],
        confidence: 0
      });
    }
    global._aiRequestInProgress = true;

    const result = await analyzeTelemetry({
      bac: typeof bac === 'number' ? bac : undefined,
      heartRate: typeof heartRate === 'number' ? heartRate : undefined,
      spo2: typeof spo2 === 'number' ? spo2 : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      drivingReady: typeof drivingReady === 'boolean' ? drivingReady : undefined,
      recentReadings: Array.isArray(recentReadings) ? recentReadings : undefined
    });

    global._aiRequestInProgress = false;

    if (!result) {
      return res.status(503).json({
        summary: 'AI analysis service temporarily unavailable.',
        riskLevel: 'LOW',
        drivingRecommendation: 'unknown',
        keyFindings: [],
        recommendations: [],
        confidence: 0
      });
    }

    res.json(result);

  } catch (err) {
    console.error('[AI Analyze] Error:', err);
    global._aiRequestInProgress = false;
    res.status(500).json({
      summary: 'Internal server error during AI analysis.',
      riskLevel: 'LOW',
      drivingRecommendation: 'unknown',
      keyFindings: [],
      recommendations: [],
      confidence: 0
    });
  }
});

//
// Keep existing backend health check working
//
app.get('/api/health-check', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is healthy' });
});

// Backup root route
app.get('/api', (req, res) => {
  res.json({ message: 'SoberWatch API v2' });
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Express Error] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SoberWatch backend listening on port ${PORT}`);
  console.log(`AI status: ${isConfigured() ? 'configured (Gemini)' : 'unconfigured'}`);
  console.log(`Model: ${model}`);
});

module.exports = app;