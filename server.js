const { createServer } = require('http');
const next = require('next');

const dev = false; // Production mode
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    handle(req, res, parsedUrl);
  }).listen(process.env.PORT || 3000, (err) => {
    if (err) throw err;
    console.log(`> API ready on port ${process.env.PORT || 3000}`);
  });
});
