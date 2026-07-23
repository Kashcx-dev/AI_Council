import dotenv from 'dotenv';
dotenv.config();

import { initTelemetry } from './telemetry/signoz.js';
// Initialize OpenTelemetry before importing application modules
initTelemetry();

import express from 'express';
import cors from 'cors';
import { apiRouter } from './api/routes.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'HEALTHY', service: 'AI Council Backend', timestamp: new Date().toISOString() });
});

app.use('/api', apiRouter);
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`[AI Council Server] Running on http://localhost:${PORT}`);
});
