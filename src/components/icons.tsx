import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function IconResize(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="3" y="3" width="12" height="12" rx="2" />
      <path d="M9 21h12V9" />
    </svg>
  );
}

export function IconCrop(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </svg>
  );
}

export function IconCompress(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
    </svg>
  );
}

export function IconConvert(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  );
}

export function IconVideo(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </svg>
  );
}

export function IconGif(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9v6M8 12h2M13 9v6M13 9h3M18 9v6" />
    </svg>
  );
}

export function IconMeme(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9h.01M16 9h.01M8 15c1.2 1.3 2.6 2 4 2s2.8-.7 4-2" />
    </svg>
  );
}

export function IconFavicon(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCoffee(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 4v2M12 4v2" />
    </svg>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M5 12h14m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9L12 3Z" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.8} aria-hidden="true">
      <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" />
      <path d="M16.8 3.4v3.2M15.2 5h3.2" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
    </svg>
  );
}

export function IconGithub(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.5} aria-hidden="true">
      <path d="M9 19c-4 1.2-4-2.2-5.5-2.7M15 21v-3.3c0-.9.1-1.3-.5-1.9 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.3 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.9 5.8 3.2 5.8 3.2a4.4 4.4 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.3 9.7c0 4.7 2.8 5.7 5.5 6-.6.6-.6 1.2-.5 1.9V21" />
    </svg>
  );
}

export const TOOL_ICONS = {
  resize: IconResize,
  crop: IconCrop,
  compress: IconCompress,
  convert: IconConvert,
  video: IconVideo,
  gif: IconGif,
  meme: IconMeme,
  favicon: IconFavicon,
};
