/**
 * Unit tests — style resolvers (phase 8)
 *
 * Covers:
 *  Queries: style, styleBySlug, styles, searchStyles,
 *           webSearchStyles (success / INTERNAL_SERVER_ERROR)
 *  Mutations: createStyle, updateStyle, deleteStyle,
 *             saveSearchResultAsStyle (builds image array correctly),
 *             generateStyleTryOn (success / fetch error BAD_GATEWAY /
 *                                 service non-ok BAD_GATEWAY)
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const StyleModelStub = {
  findById:          async () => null,
  findBySlug:        async () => null,
  find:              async () => [],
  search:            async () => [],
  create:            async () => null,
  findByIdAndUpdate: async () => null,
  delete:            async () => {},
};

const StyleSearchServiceStub = {
  searchFashionStyles: async () => [],
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('../../src/modules/styles/style.model.js',          { defaultExport: StyleModelStub });
await mock.module('../../src/services/styleSearch.service.js',        { defaultExport: StyleSearchServiceStub });
await mock.module('../../src/core/logger/index.js',                   { defaultExport: loggerStub });

const { default: styleResolvers } = await import('../../src/graphql/resolvers/style.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const userCtx = (id = 'user-1') => ({ user: { id, role: 'user', type: 'user' } });

function makeStyle(overrides = {}) {
  return {
    id:       'style-1',
    entityId: 'style-1',
    name:     'Ankara Blazer',
    category: 'ankara',
    isActive: true,
    images:   [{ url: 'https://cdn.example.com/style.jpg', isPrimary: true }],
    toSafeJSON() { return { id: this.id, name: this.name, category: this.category }; },
    ...overrides,
  };
}

/** Replace global.fetch and return a restore function. */
function mockFetch(body, status = 200) {
  const original = global.fetch;
  global.fetch = async () => ({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  return () => { global.fetch = original; };
}

/** Make fetch throw a network error. */
function mockFetchNetworkError(message = 'Network error') {
  const original = global.fetch;
  global.fetch = async () => { throw new Error(message); };
  return () => { global.fetch = original; };
}

// ─── style query ──────────────────────────────────────────────────────────────

test('style — returns style when found', async () => {
  StyleModelStub.findById = async () => makeStyle();

  const result = await styleResolvers.Query.style(null, { id: 'style-1' });

  assert.equal(result.id, 'style-1');
  assert.equal(result.name, 'Ankara Blazer');
});

test('style — returns null when style does not exist', async () => {
  StyleModelStub.findById = async () => null;

  const result = await styleResolvers.Query.style(null, { id: 'missing' });

  assert.equal(result, null);
});

// ─── styleBySlug query ────────────────────────────────────────────────────────

test('styleBySlug — returns style matching slug', async () => {
  StyleModelStub.findBySlug = async () => makeStyle();

  const result = await styleResolvers.Query.styleBySlug(null, { slug: 'ankara-blazer' });

  assert.equal(result.name, 'Ankara Blazer');
});

// ─── styles query ─────────────────────────────────────────────────────────────

test('styles — returns list of styles', async () => {
  StyleModelStub.find = async () => [makeStyle(), makeStyle({ id: 'style-2', name: 'Agbada' })];

  const result = await styleResolvers.Query.styles(null, { category: 'ankara', isActive: true });

  assert.equal(result.length, 2);
});

// ─── searchStyles query ───────────────────────────────────────────────────────

test('searchStyles — returns search results', async () => {
  StyleModelStub.search = async () => [makeStyle()];

  const result = await styleResolvers.Query.searchStyles(null, { query: 'ankara', limit: 10 });

  assert.equal(result.length, 1);
});

// ─── webSearchStyles query ────────────────────────────────────────────────────

test('webSearchStyles — returns results from StyleSearchService', async () => {
  StyleSearchServiceStub.searchFashionStyles = async () => [
    { name: 'Lagos Gown', imageUrl: 'https://img.example.com/1.jpg' },
  ];

  const result = await styleResolvers.Query.webSearchStyles(null, { query: 'gown nigeria', limit: 5 });

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Lagos Gown');
});

test('webSearchStyles — throws INTERNAL_SERVER_ERROR when service throws synchronously', async () => {
  // The resolver does `return StyleSearchService.searchFashionStyles(...)` (no await)
  // so only a synchronous throw is caught by the surrounding try/catch.
  StyleSearchServiceStub.searchFashionStyles = () => {
    throw new Error('SerpAPI quota exceeded');
  };

  await assert.rejects(
    () => styleResolvers.Query.webSearchStyles(null, { query: 'dress', limit: 5 }),
    (err) => { assert.equal(err.extensions?.code, 'INTERNAL_SERVER_ERROR'); return true; }
  );
});

// ─── createStyle mutation ─────────────────────────────────────────────────────

test('createStyle — creates and returns new style', async () => {
  StyleModelStub.create = async (data) => makeStyle({ name: data.name, createdBy: data.createdBy });

  const result = await styleResolvers.Mutation.createStyle(
    null,
    { input: { name: 'Kente Shirt', category: 'kente' } },
    userCtx('user-1')
  );

  assert.equal(result.name, 'Kente Shirt');
  assert.equal(result.createdBy, 'user-1');
});

// ─── updateStyle mutation ─────────────────────────────────────────────────────

test('updateStyle — updates and returns style', async () => {
  StyleModelStub.findByIdAndUpdate = async () => makeStyle({ name: 'Updated Style' });

  const result = await styleResolvers.Mutation.updateStyle(
    null, { id: 'style-1', input: { name: 'Updated Style' } }
  );

  assert.equal(result.name, 'Updated Style');
});

// ─── deleteStyle mutation ─────────────────────────────────────────────────────

test('deleteStyle — deletes style and returns true', async () => {
  StyleModelStub.delete = async () => {};

  const result = await styleResolvers.Mutation.deleteStyle(null, { id: 'style-1' });

  assert.equal(result, true);
});

// ─── saveSearchResultAsStyle mutation ─────────────────────────────────────────

test('saveSearchResultAsStyle — creates style with proper images array', async () => {
  const createCalls = [];
  StyleModelStub.create = async (data) => {
    createCalls.push(data);
    return makeStyle();
  };

  await styleResolvers.Mutation.saveSearchResultAsStyle(
    null,
    {
      input: {
        name:        'Web Result',
        category:    'dress',
        imageUrl:    'https://img.example.com/dress.jpg',
        thumbnail:   'https://img.example.com/dress-thumb.jpg',
        sourceUrl:   'https://source.example.com/dress',
        searchQuery: 'lace dress',
      },
    },
    userCtx('user-1')
  );

  const call = createCalls[0];
  assert.equal(call.source, 'search');
  assert.equal(call.searchQuery, 'lace dress');
  assert.equal(call.images.length, 1);
  assert.equal(call.images[0].url, 'https://img.example.com/dress.jpg');
  assert.equal(call.images[0].thumbnail, 'https://img.example.com/dress-thumb.jpg');
  assert.equal(call.images[0].isPrimary, true);
  assert.equal(call.createdBy, 'user-1');
});

// ─── generateStyleTryOn mutation ──────────────────────────────────────────────

test('generateStyleTryOn — returns results from image generation service', async () => {
  const restore = mockFetch({ results: [{ url: 'https://gen.example.com/out.jpg' }], total: 1, styleTitle: 'Test' });

  try {
    const result = await styleResolvers.Mutation.generateStyleTryOn(
      null,
      { input: { styleTitle: 'Test', userPhoto: 'base64data', styleImage: 'base64data2' } }
    );

    assert.equal(result.total, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.styleTitle, 'Test');
  } finally {
    restore();
  }
});

test('generateStyleTryOn — throws BAD_GATEWAY when fetch throws network error', async () => {
  const restore = mockFetchNetworkError('connection refused');

  try {
    await assert.rejects(
      () => styleResolvers.Mutation.generateStyleTryOn(
        null,
        { input: { styleTitle: 'Test', userPhoto: 'x', styleImage: 'y' } }
      ),
      (err) => { assert.equal(err.extensions?.code, 'BAD_GATEWAY'); return true; }
    );
  } finally {
    restore();
  }
});

test('generateStyleTryOn — throws BAD_GATEWAY when service returns non-ok status', async () => {
  const restore = mockFetch({ error: 'Model overloaded' }, 503);

  try {
    await assert.rejects(
      () => styleResolvers.Mutation.generateStyleTryOn(
        null,
        { input: { styleTitle: 'Test', userPhoto: 'x', styleImage: 'y' } }
      ),
      (err) => { assert.equal(err.extensions?.code, 'BAD_GATEWAY'); return true; }
    );
  } finally {
    restore();
  }
});
