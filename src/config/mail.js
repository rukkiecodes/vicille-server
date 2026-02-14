import config from './index.js';

export const mailConfig = {
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
  defaults: {
    from: config.email.from,
  },
};

export default mailConfig;
