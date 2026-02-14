import config from './index.js';

export const databaseConfig = {
  redis: {
    url: config.redis.url,
  },
};

export default databaseConfig;
