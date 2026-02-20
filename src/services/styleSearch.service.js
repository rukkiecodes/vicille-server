import config from '../config/index.js';
import logger from '../core/logger/index.js';

const SERP_API_BASE = 'https://serpapi.com/search';

const StyleSearchService = {
  async searchFashionStyles(searchQuery, limit = 10) {
    const apiKey = config.styleSearch?.serpApiKey;
    if (!apiKey) {
      throw new Error('SerpAPI key not configured. Set SERP_API_KEY in environment.');
    }

    const params = new URLSearchParams({
      engine: 'google_images',
      q: `${searchQuery} fashion style outfit`,
      api_key: apiKey,
      num: String(Math.min(limit, 100)),
      safe: 'active',
      hl: 'en',
    });

    logger.info(`Searching fashion styles: "${searchQuery}"`);

    const response = await fetch(`${SERP_API_BASE}?${params}`);
    if (!response.ok) {
      const text = await response.text();
      logger.error(`SerpAPI error ${response.status}: ${text}`);
      throw new Error(`Style search failed: ${response.status}`);
    }

    const data = await response.json();
    const results = (data.images_results || []).slice(0, limit).map(img => ({
      title: img.title || searchQuery,
      imageUrl: img.original || img.thumbnail || '',
      thumbnail: img.thumbnail || img.original || '',
      sourceUrl: img.link || null,
      source: img.source || null,
    }));

    return {
      query: searchQuery,
      results,
      total: results.length,
    };
  },
};

export default StyleSearchService;
