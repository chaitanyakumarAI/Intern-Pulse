import type { MetadataRoute } from 'next';

// A personal tracker: keep it out of search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
