import type { APIRoute } from 'astro';
import { withBase } from '../lib/paths';

export const GET: APIRoute = () => {
  const origin = import.meta.env.SITE;
  const body = origin
    ? `User-agent: *\nAllow: /\nSitemap: ${new URL(withBase('/sitemap.xml'), origin).href}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
