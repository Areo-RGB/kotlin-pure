import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Sentry plugin - only uploads source maps if SENTRY_AUTH_TOKEN is set
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: 'h03',
            project: 'scoresync-tools',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              assets: './dist/**',
            },
          }),
        ]
      : []),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - separate large dependencies
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase': ['firebase/app', 'firebase/database', 'firebase/auth'],
          // MediaPipe for pose detection
          'mediapipe': ['@mediapipe/tasks-vision'],
          // Three.js for 3D graphics
          'three': ['three'],
          // Animation libraries
          'animation': ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to 1000 kB for vendor chunks
  }
});