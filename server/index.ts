/** Servidor independiente (produccion / pruebas manuales): `npm run server`. */
import { createServer } from 'node:http';
import { handleBukRequest } from './bukProxy';

const port = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  if (!(await handleBukRequest(req, res))) {
    res.statusCode = 404;
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Proxy Buk en http://127.0.0.1:${port}`));
