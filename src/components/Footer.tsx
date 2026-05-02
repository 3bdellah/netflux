import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-12 w-full max-w-7xl rounded-[1.75rem] border border-white/8 bg-slate-950/60 p-8 text-[10px] uppercase tracking-[2px] text-slate-600 backdrop-blur-xl">
      <div className="grid w-full grid-cols-2 gap-8 text-center md:grid-cols-4 md:text-left">
        <div className="flex flex-col gap-3">
          <span className="mb-2 font-bold text-slate-400">Platform</span>
          <Link to="/" className="transition-colors hover:text-sky-400">
            Overview
          </Link>
          <Link to="/speed-test" className="transition-colors hover:text-sky-400">
            Start Test
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <span className="mb-2 font-bold text-slate-400">Support</span>
          <Link to="/contact" className="transition-colors hover:text-sky-400">
            Contact Us
          </Link>
          <Link to="/about" className="transition-colors hover:text-sky-400">
            Help and FAQ
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <span className="mb-2 font-bold text-slate-400">Legal</span>
          <Link to="/privacy-policy" className="transition-colors hover:text-sky-400">
            Privacy Policy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-sky-400">
            Terms of Service
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <span className="mb-2 font-bold text-slate-400">Connect</span>
          <span className="text-slate-700">
            Twitter (X)
          </span>
          <span className="text-slate-700">
            LinkedIn
          </span>
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
        <div className="flex gap-8">
          <span>@QBnova, En</span>
          <span>v4.0.0-NetFlux-lab</span>
        </div>
        <div className="opacity-50">&copy; 2026 NETFLUX LABS | LIVE NETWORK INSIGHTS</div>
      </div>
    </footer>
  );
}
