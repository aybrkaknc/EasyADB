/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                "terminal-green": {
                    DEFAULT: "#00ff41",
                    dim: "#003b00",
                    20: "rgba(0, 255, 65, 0.2)",
                    10: "rgba(0, 255, 65, 0.1)",
                },
                "terminal-red": {
                    DEFAULT: "#ff003c",
                    dim: "#4a000f",
                    20: "rgba(255, 0, 60, 0.2)",
                },
                "terminal-amber": {
                    DEFAULT: "#ffb000",
                    dim: "#4a3200",
                    20: "rgba(255, 176, 0, 0.2)",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: {
                mono: ["JetBrains Mono", "monospace"],
                space: ["Space Grotesk", "sans-serif"],
            },
            animation: {
                "scanline": "scanline 8s linear infinite",
            },
            keyframes: {
                scanline: {
                    "0%": { transform: "translateY(-100%)" },
                    "100%": { transform: "translateY(100%)" },
                },
                "cursor-blink": {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0" },
                },
                "fade-in": {
                    "0%": { opacity: "0", transform: "translateY(-8px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                }
            },
            animation: {
                "scanline": "scanline 8s linear infinite",
                "cursor-blink": "cursor-blink 1s step-end infinite",
                "fade-in": "fade-in 150ms ease-out",
            },
        },
    },
    plugins: [],
}
