import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // MIME-Sniffing aus (verhindert Script-Execution bei disguised Uploads)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking-Schutz (Admin-Seiten haben sensible Daten)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Strict-Transport (in Prod sinnvoll; im Dev no-op)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Referrer nur für gleicher Origin (Admin-Links leaken sonst an Drittseiten)
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Permissions-Policy: kein Kamera/Mikrofon/Payment nötig
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
