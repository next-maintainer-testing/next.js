const {createServer} = require('node:http');
const {parse} = require('node:url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '127.0.0.1';
const port = Number(process.env.PORT || 3036);
const app = next({dev, hostname, port});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // This is the custom-server URL handling used by the reporter.
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, () => {
    console.log(`Ready on http://${hostname}:${port}`);
  });
}).catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
