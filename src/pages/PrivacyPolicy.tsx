import React from 'react';
import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  return (
    <div className="w-full flex flex-col items-center">
      <SEO 
        title="Privacy Policy | NetFlux Labs"
        description="Learn about how we handle your data. Transparency and privacy are at the core of our speed testing technology."
      />

      <div className="w-full max-w-3xl py-12 prose prose-invert prose-slate">
        <h1 className="text-4xl font-light mb-8">Privacy <span className="text-sky-400">Policy</span></h1>
        
        <p className="text-slate-400">Last Updated: April 29, 2026</p>

        <h2 className="text-white font-medium mt-12">1. Data Collection</h2>
        <p className="text-slate-400">
          NetFlux Labs operates on a "minimal collection" principle. When you run a speed test, we temporarily process network metrics (latency, bandwidth) to provide you with results. We do not store your IP address in association with your test results permanently.
        </p>

        <h2 className="text-white font-medium mt-12">2. How We Use Data</h2>
        <p className="text-slate-400">
          The data collected is used solely to:
          <ul className="list-disc pl-6 mt-4">
            <li>Render your real-time speed test results</li>
            <li>Analyze aggregate network performance trends (anonymized)</li>
            <li>Improve our server load balancing algorithms</li>
          </ul>
        </p>

        <h2 className="text-white font-medium mt-12">3. Third-Party Services</h2>
        <p className="text-slate-400">
          We use Google AdSense to serve advertisements. These providers may use cookies and web beacons to serve ads based on your visits to this and other sites. You may opt out of personalized advertising by visiting Google's Ads Settings.
        </p>

        <h2 className="text-white font-medium mt-12">4. Your Rights</h2>
        <p className="text-slate-400">
          Since we do not store personally identifiable information, most data requests are not applicable. However, we respect all GDPR and CCPA guidelines regarding automated data processing.
        </p>

        <h2 className="text-white font-medium mt-12">5. Contact Information</h2>
        <p className="text-slate-400">
          If you have questions about this policy, contact us at <span className="text-sky-400">privacy@netflux.io</span>.
        </p>
      </div>
    </div>
  );
}
