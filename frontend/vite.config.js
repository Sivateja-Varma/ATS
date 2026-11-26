import { defineConfig } from 'vite';

const services = {
  '/api/auth': 'http://127.0.0.1:8003',
  '/api/seeker': 'http://127.0.0.1:8000',
  '/api/recruiter': 'http://127.0.0.1:8001',
  '/api/applications': 'http://127.0.0.1:8002',
};

export default defineConfig({
  server: {
    proxy: Object.fromEntries(Object.entries(services).map(([prefix, target]) => [prefix, {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
    }])),
  },
});
