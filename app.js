const debug = require('debug');
const log = debug('app-server:info');
const errorLog = debug('app-server:error');
const createError = require('http-errors');
const connectDB = require('./db/connect');
const errorHandler = require('./middleware/server');
const {checkAppLang} = require('./middleware/languageChecker')
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const fs = require('fs');
const http = require('http');
const https = require('https');
const io = require("socket.io");
const cors = require('cors');

const {i18next, i18nextMiddleware} = require('./controllers/localization');
const {authorize} = require('./middleware/auth');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const staffRouter = require('./routes/staff');
const plansRouter = require('./routes/plans')
const paymentsRouter = require('./routes/payments');
const adminRouter = require('./routes/admin');
const sysRouter = require('./routes/system');

const app = express();

/** View engine setup */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(i18nextMiddleware.handle(i18next));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

app.use('/system', sysRouter);
app.use(checkAppLang);
app.use('/home', indexRouter);
app.use('/users', usersRouter)
app.use('/staff', staffRouter);
app.use('/plans', plansRouter);
app.use('/payments', paymentsRouter);
app.use('/admin', authorize('Access', ['Admin']));
app.use('/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(errorHandler);

/** Get port from environment and store in Express */
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

const sslInstalled = process.env.SECURITY_SSL_INSTALLED === 'True';
global.socketIO;
if (sslInstalled) {
  const options = {
    key: fs.readFileSync('ssl/privkey.pem'),
    cert: fs.readFileSync('ssl/cert.pem'),
    ca: [
      fs.readFileSync('ssl/chain.pem'),
      fs.readFileSync('ssl/fullchain.pem'),
    ]
  };
  const httpsServer = https.createServer(options, app);
  socketIO = io(httpsServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  socketIO.on('connection', (socket) => {
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress.split(":")[3];
    console.log(`Socket connected with ID: ${socket.id} from IP Address: ${ip}`);
    // socket.emit('notifications', {newCount: require('./utils/codeGenerator').generateNumber(2)});

    socket.on('disconnect', () => {
      console.log(`Socket disconnected with ID: ${socket.id}`);
    })
  });
  connectDB()
      .then(() => httpsServer.listen(port, onListening).on('error', onError))
}
else {
  const httpServer = http.createServer(app);
  socketIO = io(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  socketIO.on('connection', (socket) => {
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress.split(":")[3];
    console.log(`Socket connected with ID: ${socket.id} from IP Address: ${ip}`);
    // socket.emit('notifications', {newCount: require('./utils/codeGenerator').generateNumber(2)});

    socket.on('disconnect', () => {
      console.log(`Socket disconnected with ID: ${socket.id}`);
    })
  });
  connectDB()
      .then(() => httpServer.listen(port, onListening).on('error', onError))
}

/** Normalize a port into a number, string, or false */
function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/** Event listener for HTTP server "error" event */
function onError(error) {

  console.error(error);
  if (error.syscall !== 'listen') {
    console.error(error);
    throw error;
  }

  const bind = typeof port === 'string'
      ? 'Pipe ' + port
      : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      errorLog(`${bind} requires elevated privileges`)
      process.exit(1);
      break;
    case 'EADDRINUSE':
      errorLog(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      console.error(error);
      throw error;
  }
}

/** Event listener for HTTP server "listening" event */
function onListening() {

  const bind = typeof port === 'string'
      ? 'pipe ' + port
      : 'port ' + port;
  log(`Listening on ${bind}`);
}
