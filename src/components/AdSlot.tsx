import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: string;
      height: number;
      width: number;
      params: Record<string, unknown>;
    };
  }
}

interface AdSlotProps {
  type: 'banner' | 'sidebar' | 'inline';
  className?: string;
}

export default function AdSlot({ type, className = '' }: AdSlotProps) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const dimensions = {
    banner: 'h-24 md:h-32 w-full',
    sidebar: 'w-40 h-[600px]',
    inline: 'h-64 w-full'
  };

  useEffect(() => {
    const container = adContainerRef.current;
    if (!container) return;

    container.innerHTML = '';
    window.atOptions = {
      key: 'aaa7f258c047644ecf7d56875707ef4e',
      format: 'iframe',
      height: 90,
      width: 728,
      params: {}
    };

    const script = document.createElement('script');
    script.src = 'https://www.highperformanceformat.com/aaa7f258c047644ecf7d56875707ef4e/invoke.js';
    script.async = true;
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, []);

  return (
    <div className={`ad-slot rounded-xl ${dimensions[type]} ${className}`}>
      <div ref={adContainerRef} className="flex w-full max-w-[728px] items-center justify-center overflow-hidden" />
    </div>
  );
}
