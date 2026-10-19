import { useState } from "react";

/** Program photo with a designed fallback when staff haven't uploaded one yet. */
export function ProgramImage({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} className={className} />;
  return (
    <div role="img" aria-label={alt} className={`flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground ${className}`}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.6 5.6c3.5 3.5 9.3 3.5 12.8 0M5.6 18.4c3.5-3.5 9.3-3.5 12.8 0" />
      </svg>
    </div>
  );
}
