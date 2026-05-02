import React from 'react';
import netfluxLogo from '../assets/netflux-logo.png';

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src={netfluxLogo}
      alt="NetFlux"
      className={className}
      loading="eager"
      decoding="async"
    />
  );
}
