import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "list"
  | "plus"
  | "user"
  | "settings"
  | "chevron"
  | "logout"
  | "arrow"
  | "shield"
  | "calendar"
  | "photo"
  | "check"
  | "warning";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 15a2 2 0 0 0 .4 2.2l-2.2 2.2A2 2 0 0 0 15 19a2 2 0 0 0-1.4 2h-3.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-2.2-2.2A2 2 0 0 0 5 15a2 2 0 0 0-2-1.4v-3.2A2 2 0 0 0 5 9a2 2 0 0 0-.4-2.2l2.2-2.2A2 2 0 0 0 9 5a2 2 0 0 0 1.4-2h3.2A2 2 0 0 0 15 5a2 2 0 0 0 2.2-.4l2.2 2.2A2 2 0 0 0 19 9a2 2 0 0 0 2 1.4v3.2A2 2 0 0 0 19 15Z" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  logout: (
    <>
      <path d="m10 17 5-5-5-5M15 12H3" />
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  photo: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  warning: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 9v5M12 18h.01" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & {
  readonly name: IconName;
  readonly size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
