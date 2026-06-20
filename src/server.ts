import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './services/prisma.service.js';

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

  server.listen(env.PORT, () => {
    console.log(`Diagnosis Center Backend API listening on http://localhost:${env.PORT}`);
    console.log(`API docs: http://localhost:${env.PORT}${env.API_PREFIX}/docs`);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    await disconnectDatabase();
    console.log('Server closed. Database disconnected.');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void startServer();
