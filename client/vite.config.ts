import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: process.env.VITE_PORT ? Number(process.env.VITE_PORT) : undefined,
    strictPort: !!process.env.VITE_PORT,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? 3756}`,
        changeOrigin: true,
      },
    },
  },
})
