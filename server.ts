import { config } from 'dotenv';
import { resolve } from 'path';
import { createServer, Server } from 'http';
import { parse } from 'url';
import next from 'next';
import { validateEnvironment } from './lib/config';
import { logger } from './lib/logger';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.SERVER_HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
try {
  validateEnvironment();
} catch (error) {
  logger.error('Environment validation failed', error);
  process.exit(1);
}

const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

function setupGracefulShutdown(server: Server): void {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    shutdown('unhandledRejection');
  });
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '/', true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      logger.error('Error handling request', error, { url: req.url });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  });

  setupGracefulShutdown(server);

  server.listen(port, hostname, () => {
    logger.info('Server started', {
      hostname,
      port,
      environment: process.env.NODE_ENV || 'development',
      protocol: 'http',
    });
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> Using Server-Sent Events (SSE) for real-time streaming`);
  });

  server.on('error', (error) => {
    logger.error('Server error', error);
    process.exit(1);
  });
}).catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});

