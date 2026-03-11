import React from "react";

export default function AtlasMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 128 128"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="atlas-mark-main" x1="18" y1="102" x2="96" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D5D7DC" />
          <stop offset="0.35" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C4C7CE" />
        </linearGradient>
        <linearGradient id="atlas-mark-cut" x1="20" y1="88" x2="116" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F6F7F8" />
          <stop offset="0.48" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D3D7DE" />
        </linearGradient>
      </defs>

      <path
        d="M64 10.5L108.5 104H89.3L64 51.2L38.7 104H19.5L64 10.5Z"
        fill="url(#atlas-mark-main)"
      />
      <path
        d="M63.7 28.2L94.4 92.8H83.1L63.8 52.2L44.6 92.8H33.2L63.7 28.2Z"
        fill="#06070B"
      />
      <path
        d="M18 90.2L68.4 63.6L111 50.2L74.2 74.6L25.7 96.9L18 90.2Z"
        fill="url(#atlas-mark-cut)"
      />
      <path
        d="M31.3 97.7L74.4 75.2L109.6 60.5L115.5 61.1L73.3 81.4L40.9 104.5L31.3 97.7Z"
        fill="#BFC3CB"
        opacity="0.9"
      />
      <path
        d="M75.2 75.1L112.9 56.7L95.1 74.8L75.2 75.1Z"
        fill="#FFFFFF"
        opacity="0.95"
      />
      <path
        d="M84.5 45.8L97.6 72.9L90.9 75.9L78.2 49.7L84.5 45.8Z"
        fill="#A8ADB7"
        opacity="0.9"
      />
    </svg>
  );
}
