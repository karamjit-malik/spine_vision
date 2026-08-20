/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#000000",
          900: "#050505",
          850: "#0a0a0a",
          800: "#101010",
          700: "#171717",
          600: "#1f1f1f",
          500: "#2a2a2a",
        },
        ash: {
          500: "#6b6b6b",
          400: "#8a8a8a",
          300: "#a3a3a3",
          200: "#c4c4c4",
          100: "#e4e4e4",
        },
        accent: {
          DEFAULT: "#9ca3af",
          soft: "#4b5563",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(163,163,163,0.35)" },
          "70%": { boxShadow: "0 0 0 10px rgba(163,163,163,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(163,163,163,0)" },
        },
        "fade-up": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        drift: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.06)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2s infinite",
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.8s infinite",
        drift: "drift 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
