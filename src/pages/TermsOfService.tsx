import React from 'react';
import SEO from '../components/SEO';

export default function TermsOfService() {
  return (
    <div className="w-full flex flex-col items-center">
      <SEO 
        title="Terms of Service | NetFlux"
        description="Official terms of use for the NetFlux speed testing platform. Agreement on usage and service limitations."
      />

      <div className="w-full max-w-3xl py-12 prose prose-invert prose-slate">
        <h1 className="text-4xl font-light mb-8">Terms of <span className="text-sky-400">Service</span></h1>
        
        <p className="text-slate-400">Last Updated: April 29, 2026</p>

        <h2 className="text-white font-medium mt-12">1. Acceptable Use</h2>
        <p className="text-slate-400">
          NetFlux is provided for personal and professional network testing. You agree not to use our infrastructure for denial-of-service (DoS) attacks or automated scraping that exceeds reasonable human use limits.
        </p>

        <h2 className="text-white font-medium mt-12">2. Service Limitations</h2>
        <p className="text-slate-400">
          Speed test results are provided "as-is." While we strive for absolute accuracy, factors outside our control (browser overhead, local hardware, shared network environments) can influence results.
        </p>

        <h2 className="text-white font-medium mt-12">3. Intellectual Property</h2>
        <p className="text-slate-400">
          The NetFlux brand, logo, and custom gauge technology are the property of NetFlux Labs. You may share your results screenshots or data summaries freely with proper attribution.
        </p>

        <h2 className="text-white font-medium mt-12">4. Termination</h2>
        <p className="text-slate-400">
          We reserve the right to block IP addresses or networks that exhibit malicious behavior toward our testing endpoints.
        </p>

        <h2 className="text-white font-medium mt-12">5. Jurisdiction</h2>
        <p className="text-slate-400">
          These terms are governed by the laws of Germany.
        </p>
      </div>
    </div>
  );
}
