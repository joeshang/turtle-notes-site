import type { APIRoute } from 'astro';
import { withBase } from '../lib/paths';

export const GET: APIRoute = () => {
  const origin = import.meta.env.SITE;
  const urls = origin ? ['/', '/privacy/', '/support/', '/downloads/', '/changelog/'].map(path =>
    `<url><loc>${new URL(withBase(path), origin).href.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loc></url>`
  ).join('') : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
