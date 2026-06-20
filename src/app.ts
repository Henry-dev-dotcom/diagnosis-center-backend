import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiDocument } from './config/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRequestLogger } from './middleware/audit.js';
import { applyGlobalMiddleware } from './middleware/security.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  applyGlobalMiddleware(app);

  app.get('/', (_req, res) => {
    res.json({
      name: 'Diagnosis Center Backend API',
      status: 'running',
      docs: env.ENABLE_API_DOCS ? `${env.API_PREFIX}/docs` : null,
      health: `${env.API_PREFIX}/health`
    });
  });

  if (env.ENABLE_API_DOCS) {
    app.use(`${env.API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(env.API_PREFIX, apiRequestLogger, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
