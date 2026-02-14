import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mergeResolvers } from '@graphql-tools/merge';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../core/logger/index.js';
import typeDefs from './typeDefs/index.js';
import resolvers from './resolvers/index.js';

/**
 * Build the executable schema from type definitions and resolvers
 */
const buildSchema = () => {
  const mergedResolvers = mergeResolvers(resolvers);
  return makeExecutableSchema({
    typeDefs,
    resolvers: mergedResolvers,
  });
};

/**
 * Extract user from JWT token in the request
 */
const getUser = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'vicelle-api',
      audience: 'vicelle-app',
    });

    return {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
      type: decoded.type,
    };
  } catch (error) {
    logger.debug('GraphQL auth: Invalid or expired token');
    return null;
  }
};

/**
 * Setup GraphQL with Apollo Server
 */
export const setupGraphQL = async (app, httpServer) => {
  const schema = buildSchema();

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
    formatError: (formattedError, error) => {
      // Log errors
      logger.error('GraphQL Error:', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path,
      });

      // In production, hide internal error details
      if (config.isProd && formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return {
          ...formattedError,
          message: 'An internal error occurred',
        };
      }

      return formattedError;
    },
    // Enable introspection in development, disable in production
    introspection: !config.isProd,
    // Apollo Sandbox is enabled by default in Apollo Server 4 for development
    // To enable in production, set to true
  });

  await server.start();

  // Apply middleware
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        const user = getUser(req);
        return {
          user,
          req,
        };
      },
    })
  );

  logger.info('✅ GraphQL server started');
  logger.info(`🚀 Apollo Sandbox: http://${config.server.host}:${config.server.port}/graphql`);
  logger.info(`📊 GraphQL Endpoint: http://${config.server.host}:${config.server.port}/graphql`);

  return server;
};

export default setupGraphQL;
