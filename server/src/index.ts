import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import meetingsRoutes from './routes/meetings.js';
import summarizeRoutes from './routes/summarize.js';
import transcribeRoutes from './routes/transcribe.js';
import memoryRoutes from './routes/memory.js';
import alertsRoutes from './routes/alerts.js';
import { startDeadlineWorker } from './workers/deadlineWorker.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || '';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'] : true,
  credentials: true
}));

// Route Mounts
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/summarize', summarizeRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/alerts', alertsRoutes);

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MeetWithAI Backend',
    features: ['native_auth', 'vector_memory', 'deadline_worker', 'groq_ai']
  });
});

app.listen(PORT, () => {
  console.log(`[MeetWithAI Backend] Listening on port ${PORT}`);
  // Start autonomous event-driven deadline scheduler
  startDeadlineWorker();
});
