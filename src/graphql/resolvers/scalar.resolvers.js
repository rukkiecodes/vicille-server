import { GraphQLScalarType, Kind } from 'graphql';

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    // Firestore Timestamp: has toDate() method or _seconds/_nanoseconds properties
    if (value !== null && typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        return value.toDate().toISOString();
      }
      const seconds = value._seconds ?? value.seconds;
      if (typeof seconds === 'number') {
        return new Date(seconds * 1000).toISOString();
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value).toISOString();
    }
    return null;
  },
  parseValue(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
        try {
          return JSON.parse(ast.value);
        } catch {
          return ast.value;
        }
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
        return parseInt(ast.value, 10);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.OBJECT: {
        const value = Object.create(null);
        ast.fields.forEach((field) => {
          value[field.name.value] = JSONScalar.parseLiteral(field.value);
        });
        return value;
      }
      case Kind.LIST:
        return ast.values.map((v) => JSONScalar.parseLiteral(v));
      case Kind.NULL:
        return null;
      default:
        return null;
    }
  },
});

export default {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
};
