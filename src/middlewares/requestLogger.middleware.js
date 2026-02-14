import morgan from 'morgan';
import logger from '../core/logger/index.js';
import config from '../config/index.js';

// Custom morgan token for response time with color
morgan.token('response-time-colored', (req, res) => {
  const responseTime = res.getHeader('X-Response-Time');
  if (!responseTime) {
    return '-';
  }
  const time = parseFloat(responseTime);
  if (time < 100) {
    return `${time}ms`;
  } else if (time < 500) {
    return `${time}ms`;
  }
  return `${time}ms`;
});

// Custom format
const customFormat =
  ':method :url :status :response-time ms - :res[content-length]';

// Development format with more details
const devFormat =
  ':method :url :status :response-time ms - :res[content-length] :remote-addr';

// Create morgan middleware
export const requestLogger = morgan(config.isDev ? devFormat : customFormat, {
  stream: logger.stream,
  skip: (req, res) => {
    // Skip health check endpoints in production
    if (!config.isDev && req.url === '/health') {
      return true;
    }
    return false;
  },
});

export default requestLogger;
