import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Logo from './Logo';
import { loadNetworkInfo, type NetworkInfo } from '../lib/networkInfo';

export default function Header() {
  const location = useLocation();
  const [serverInfo, setServerInfo] = useState<NetworkInfo | null>(null);

  const navLinks = [
    { name: 'Overview', path: '/' },
    { name: 'Test', path: '/speed-test' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  useEffect(() => {
    let cancelled = false;

    const loadServerInfo = async () => {
      try {
        const data = await loadNetworkInfo();
        if (cancelled) return;

        setServerInfo(data);
      } catch {
        if (!cancelled) {
          setServerInfo({
            ip: 'unknown',
            city: 'Unknown City',
            code: 'SERVER',
          });
        }
      }
    };

    loadServerInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="relative z-10 mb-8 flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
      <Link to="/" className="flex items-center group">
        <Logo className="h-12 w-auto transform transition-transform group-hover:scale-105 sm:h-14" />
      </Link>
      
      <nav className="hidden md:flex items-center gap-8">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path;

          return (
            <Link
              key={link.path}
              to={link.path}
              className={`text-[10px] uppercase font-bold tracking-[2px] transition-colors ${
                isActive ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-5 text-[10px] uppercase font-medium text-slate-500 tracking-[2px]">
        <div className="hidden sm:flex flex-col items-end px-4 py-2">
          <span className="text-slate-400">Mode</span>
          <span className="text-slate-200">Live Test</span>
        </div>
        <div className="hidden sm:flex flex-col items-end px-4 py-2">
          <span className="text-slate-400">LOCATION</span>
          <span className="text-slate-200">
            {serverInfo ? [serverInfo.city, serverInfo.country].filter(Boolean).join(' / ') : 'Loading...'}
          </span>
          <span className="text-[9px] tracking-[1px] text-slate-400">{serverInfo?.ip || '--'}</span>
        </div>
      </div>
    </header>
  );
}
