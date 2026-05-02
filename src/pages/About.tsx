import React from 'react';
import SEO from '../components/SEO';
import AdSlot from '../components/AdSlot';

export default function About() {
  return (
    <div className="w-full flex flex-col items-center gap-12">
      <SEO 
        title="About Us | NetFlux Speed Test"
        description="Learn about NetFlux's mission to provide the world's most accurate and privacy-respecting network performance tools."
      />

      <div className="w-full max-w-4xl py-12">
        <h1 className="text-5xl font-extralight tracking-tighter mb-12">About <span className="text-sky-400">NetFlux</span></h1>
        
        <div className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-400 leading-relaxed">
          <p className="text-xl text-white font-light">
            NetFlux was founded in 2026 with a simple goal: to provide network performance data that you can actually trust.
          </p>
          
          <p>
            In an era where internet connection is as vital as electricity, understanding your bandwidth shouldn't be a guessing game. Most speed tests use compressed data or prioritized ISP traffic to inflate numbers. NetFlux takes a different approach.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-8">
            <div className="bg-white/[0.02] p-8 rounded-2xl border border-white/5">
              <h2 className="text-white text-xl font-medium mb-4">Our Technology</h2>
              <p className="text-sm">
                We use raw, high-entropy binary streams to measure throughput. This prevents modern network hardware from 'gaming' the test through compression techniques, giving you a true look at your raw bandwidth.
              </p>
            </div>
            <div className="bg-white/[0.02] p-8 rounded-2xl border border-white/5">
              <h2 className="text-white text-xl font-medium mb-4">Global Network</h2>
              <p className="text-sm">
                Our servers are co-located in major internet exchange points (IXPs) worldwide, ensuring that we measure your speed without unnecessary bottlenecks.
              </p>
            </div>
          </div>

          <h2 className="text-2xl font-light text-white mt-12">Why Privacy Matters</h2>
          <p>
            Other speed tests sell your location and network configuration data to advertisers and market research firms. We don't. NetFlux's business model is built on transparency, not data harvesting.
          </p>

          <AdSlot type="inline" />
        </div>
      </div>
    </div>
  );
}
