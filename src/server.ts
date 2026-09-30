import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './services/prisma.service.js';
import { runBillingCycle } from './services/subscription.service.js';
import { sendAlert } from './services/alerts.service.js';
import { flushApiRequestLogs } from './services/audit.service.js';

const app = createApp();
const server = createServer(app);

async function startServer() {
  try {
    await connectDatabase();
    console.log('Database connection established.');
  } catch (error) {
    console.warn('Database connection failed during startup. Health endpoint will show details.');
    console.warn(error instanceof Error ? error.message : String(error));
  }

  // Renewals, trial ends, grace and suspension: hourly, and once shortly after start.
  const cycle = () =>
    runBillingCycle()
      .then((r) => {
        if (r.outcomes.length) console.log('Billing cycle:', JSON.stringify(r.outcomes));
        const errors = r.outcomes.filter((o) => o.action.startsWith('ERROR'));
        if (errors.length) void sendAlert('Billing cycle errors', `${errors.length} subscription(s) could not be processed`, { first: errors[0].action });
      })
      .catch((e) => {
        console.error('Billing cycle failed:', e);
        void sendAlert('Billing cycle failed', e instanceof Error ? e.message : String(e));
      });
  setTimeout(cycle, 60_000).unref();
  setInterval(cycle, 60 * 60_000).unref();

  server.listen(env.PORT, () => {
    console.log(`Diagnosis Center Backend API listening on http://localhost:${env.PORT}`);
    console.log(`API docs: http://localhost:${env.PORT}${env.API_PREFIX}/docs`);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    await flushApiRequestLogs();
    await disconnectDatabase();
    console.log('Server closed. Database disconnected.');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void startServer();
