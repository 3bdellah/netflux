import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Activity, Zap, Shield, Globe, ChevronRight } from 'lucide-react';
import SEO from '../components/SEO';
import AdSlot from '../components/AdSlot';

export default function Home() {
  const faqs = [
    {
      q: "How accurate is NetFlux speed test?",
      a: "NetFlux uses high-performance servers distributed across the globe to measure your real-time connection metrics. We use high-entropy data streams to minimize compression bias."
    },
    {
      q: "Why should I test my internet speed?",
      a: "Testing helps you verify if you're getting the bandwidth promised by your ISP. It can also help troubleshoot streaming issues, gaming lag, or slow downloads."
    },
    {
      q: "What is a good ping for gaming?",
      a: "Generally, a ping (latency) under 20ms is considered excellent for competitive gaming. Anything between 20ms and 50ms is good, while over 100ms may cause noticeable lag."
    }
  ];

  return (
    <div className="w-full flex flex-col items-center gap-20">
      <SEO 
        title="NetFlux | High-Performance Internet Speed Test"
        description="Test your internet connection speed instantly. Check download, upload, and latency with NetFlux - the world's most accurate speed test tool."
      />

      {/* Hero Section */}
      <section className="w-full max-w-6xl flex flex-col lg:flex-row items-center gap-16 py-12">
        <div className="flex-1 flex flex-col gap-8 text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <h1 className="text-5xl lg:text-7xl font-extralight tracking-tighter leading-tight">
              Built for the <span className="text-sky-400 font-normal">Test</span>.
            </h1>
            <p className="text-lg text-slate-400 max-w-xl mx-auto lg:mx-0">
              The live speed dashboard is now the main experience. This page gives extra context on how NetFlux measures latency, download and upload performance.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Link 
              to="/speed-test"
              className="inline-flex items-center gap-3 bg-sky-500 hover:bg-sky-400 text-slate-950 px-10 py-5 rounded-full font-bold transition-all shadow-[0_0_30px_rgba(56,189,248,0.3)] group"
            >
              OPEN LIVE TEST
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>

        <div className="flex-1 relative">
          <motion.div
            initial={{ opacity: 0, rotate: -5 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 1 }}
            className="relative w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] rounded-full border border-white/5 bg-white/[0.02] flex items-center justify-center glow-ring"
          >
            <div className="absolute inset-[-40px] rounded-full border border-dashed border-sky-400/10 animate-[spin_60s_linear_infinite]" />
            <Zap size={120} className="text-sky-400/40" />
          </motion.div>
        </div>
      </section>

      {/* Inline Ad */}
      <AdSlot type="inline" className="max-w-4xl" />

      {/* Features Grid */}
      <section className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8">
        <FeatureCard 
          icon={<Zap className="text-sky-400" />}
          title="Ultra Precise"
          description="Millisecond accuracy for latency and high-bitrate streaming for bandwidth measurements."
        />
        <FeatureCard 
          icon={<Shield className="text-sky-400" />}
          title="Privacy First"
          description="We don't track your IP address or store identity-linked network logs. Your data remains yours."
        />
        <FeatureCard 
          icon={<Globe className="text-sky-400" />}
          title="Global Edge"
          description="Test against 500+ servers globally to find your true international performance benchmarks."
        />
      </section>

      {/* Content Section for SEO */}
      <section className="w-full max-w-4xl flex flex-col gap-12 py-20 border-t border-white/5">
        <div className="prose prose-invert max-w-none">
          <h2 className="text-3xl font-light tracking-tight mb-8">Understanding Network Performance</h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            Internet speed isn't just about how fast you can download a file. It's a combination of <strong>latency</strong>, <strong>jitter</strong>, and <strong>bandwidth</strong>. At NetFlux, we break down these metrics so you can understand exactly why your Zoom calls are dropping or why your streaming is buffering.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-12">
            <div className="bg-white/[0.02] p-8 rounded-2xl border border-white/5">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Activity size={18} className="text-sky-400" /> Latency (Ping)
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Measured in milliseconds (ms), latency is the time it takes for data to travel from your device to the server and back. Lower is always better.
              </p>
            </div>
            <div className="bg-white/[0.02] p-8 rounded-2xl border border-white/5">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Zap size={18} className="text-sky-400" /> Throughput
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Commonly referred to as 'download speed', throughput measures how much data can move through your connection in a second (Mbps).
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="flex flex-col gap-8 mt-12">
          <h2 className="text-3xl font-light tracking-tight">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 gap-6">
            {faqs.map((faq, i) => (
              <div key={i} className="group">
                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-xl transition-all hover:bg-white/[0.04]">
                  <h3 className="text-lg font-medium text-sky-400 mb-2">{faq.q}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-10 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col gap-4 hover:border-sky-400/20 transition-all hover:-translate-y-1">
      <div className="w-12 h-12 rounded-xl bg-sky-400/10 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-medium text-white">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
