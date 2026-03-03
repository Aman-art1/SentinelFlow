import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../dist/webview',
        emptyOutDir: true,
        cssMinify: true,
        minify: 'esbuild',
        target: 'es2020',
        rollupOptions: {
            output: {
                entryFileNames: 'index.js',
                assetFileNames: 'index.[ext]',
                // Inline everything for CSP compliance
                inlineDynamicImports: true,
            },
        },
        // Minify for production
        sourcemap: true,
    },
    esbuild: {
        // Drop console.log in production for performance
        drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // Optimize for webview
    base: './',
});
