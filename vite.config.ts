import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/**
 * Build config for a multi-entry Chrome extension project.
 *
 * We keep html pages as entry points plus background/content scripts,
 * then force predictable output names for manifest references.
 */
export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/popup.html'),
                options: resolve(__dirname, 'src/options.html'),
                background: resolve(__dirname, 'src/background.ts'),
                'close-guard': resolve(__dirname, 'src/content/close-guard.ts'),
                chatgpt: resolve(__dirname, 'src/content/chatgpt.ts')
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    }
})
