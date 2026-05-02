import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
}

export default function SEO({ 
  title, 
  description, 
  canonical, 
  ogType = 'website', 
  ogImage
}: SEOProps) {
  const siteName = 'NetFlux Speed Test';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const fullTitle = `${title} | ${siteName}`;
  const resolvedCanonical = canonical ? new URL(canonical, siteUrl).toString() : undefined;
  const resolvedOgImage = ogImage ? new URL(ogImage, siteUrl).toString() : undefined;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {resolvedCanonical && <link rel="canonical" href={resolvedCanonical} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:url" content={resolvedCanonical || siteUrl} />
      {resolvedOgImage && <meta property="og:image" content={resolvedOgImage} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {resolvedOgImage && <meta name="twitter:image" content={resolvedOgImage} />}

      {/* Structured Data (JSON-LD) */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": siteName,
          "url": siteUrl,
          "description": "High-performance network speed testing application.",
          "potentialAction": {
            "@type": "SearchAction",
            "target": `${siteUrl}/search?q={search_term_string}`,
            "query-input": "required name=search_term_string"
          }
        })}
      </script>
    </Helmet>
  );
}
