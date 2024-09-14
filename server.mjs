import http from 'http';
import https from 'https';
import fs from 'fs';
import next from 'next';
import { parse } from 'url';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({dev});
const handle = app.getRequestHandler();

const sslInstalled = process.env.FRONTEND_SSL_INSTALLED === 'True';
if (sslInstalled) {
    const options = {
        key: fs.readFileSync('ssl/privkey.pem'),
        cert: fs.readFileSync('ssl/cert.pem'),
        ca: [
            fs.readFileSync('ssl/chain.pem'),
            fs.readFileSync('ssl/fullchain.pem'),
        ]
    };
    app.prepare().then(() => {
        https.createServer(options, (req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        }).listen(port, (err) => {
            if (err) {
                console.log(`Server creation error: ${err}`);
                process.exit(1);
            }
            console.log(`Listening on port ${port} with secure connection`);
        });
    }).catch((err) => {
        console.log(`Server preparation error: ${err}`);
        process.exit(1);
    })
}
else {
    app.prepare().then(() => {
        http.createServer((req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        }).listen(port, (err) => {
            if (err) {
                console.log(`Server creation error: ${err}`);
                process.exit(1);
            }
            console.log(`Listening on port ${port}`);
        });
    }).catch((err) => {
        console.log(`Server preparation error: ${err}`);
        process.exit(1);
    })
}
