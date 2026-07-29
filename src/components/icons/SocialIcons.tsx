import type { SVGProps } from 'react';

// Вынесено из TattoDiary.tsx (PR 2 рефакторинга) — чистые презентационные
// иконки без связи с состоянием приложения.

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="4.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14.3" cy="5.7" r="0.9" fill="currentColor" />
    </svg>
  );
}
export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M11.3 2.8v9.4a3.15 3.15 0 1 1-2.25-3.02" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3 2.8c.3 2.05 1.9 3.6 4 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function PinterestIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.2 14.5 10 6.8m0 0c1.9 0 3 1 3 2.6 0 1.9-1.1 3.2-2.7 3.2-.6 0-1-.2-1.2-.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M12.3 3.5h-1.6c-1.5 0-2.5 1-2.5 2.6V8H6.2v2.4h1.9V17h2.6v-6.6h1.9l.3-2.4h-2.2V6.4c0-.5.3-.8.8-.8h1.7z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M10 3.5a6.5 6.5 0 0 0-5.6 9.8L3.5 16.5l3.3-.9A6.5 6.5 0 1 0 10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M7.6 7.4c-.3.6-.1 1.4.5 2.3.7 1 1.7 1.9 2.7 2.3.6.3 1.2.2 1.6-.2l.3-.3c.2-.2.2-.5 0-.7l-.9-.9c-.2-.2-.5-.2-.6 0l-.3.3c-.5-.2-1-.6-1.4-1s-.7-.9-.9-1.4l.3-.3c.2-.2.2-.4 0-.6l-.9-.9c-.2-.2-.5-.2-.7 0Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
