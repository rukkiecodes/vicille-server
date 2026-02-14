import config from './index.js';

export const socketConfig = {
  cors: {
    origin: config.socket.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
};

export const namespaces = {
  USER: '/user',
  TAILOR: '/tailor',
  ADMIN: '/admin',
};

export default socketConfig;
