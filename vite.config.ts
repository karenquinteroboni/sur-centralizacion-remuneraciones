import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleBukRequest } from './server/bukProxy';

/** En desarrollo, el proxy de Buk corre dentro del servidor de Vite (mismo origen, sin CORS). */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const bukProxy: Plugin = {
    name: 'buk-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(await handleBukRequest(req, res, { env }))) next();
      });
    },
  };
  return {
    plugins: [
      react(),
      bukProxy,
    ],
    server: { port: 5180, open: false },
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  } as any;
});
