import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const clientErrorLogger = (): Plugin => ({
  name: 'client-error-logger',
  configureServer(server) {
    server.middlewares.use('/__client_error', (req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        console.error('\n🚨 [CLIENT RUNTIME ERROR]:', body, '\n');
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('OK');
      });
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), clientErrorLogger()],
})
