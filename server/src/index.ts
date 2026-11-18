import app from './app.js';
import { startDeadlineWorker } from './workers/deadlineWorker.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[MeetWithAI Backend] Listening on port ${PORT}`);
  // Start autonomous event-driven deadline scheduler for local background tasks
  startDeadlineWorker();
});
