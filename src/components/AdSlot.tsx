import React from 'react';

interface AdSlotProps {
  type: 'banner' | 'sidebar' | 'inline';
  className?: string;
}

export default function AdSlot({ type, className = '' }: AdSlotProps) {
  const dimensions = {
    banner: 'h-24 md:h-32 w-full',
    sidebar: 'w-40 h-[600px]',
    inline: 'h-64 w-full'
  };

  return (
    <div className={`ad-slot rounded-xl ${dimensions[type]} ${className}`} aria-hidden="true">
      <div className="text-[10px] text-slate-700 font-mono">
        Ads by Google AdSense
      </div>
    </div>
  );
}
