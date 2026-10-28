const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { jwtSecret, sessionSecret } = require('./config');
const customerRoutes = require('./router/auth_users').authenticated;
const generalRoutes = require('./router/general').general;

const app = express();
app.disable('x-powered-by');
app.set('json spaces', 2);
app.use(express.json({ limit: '20kb' }));
app.use('/customer', session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 3600000 }
}));
app.use('/customer/auth', (req, res, next) => {
  const token = req.session?.authorization?.accessToken;
  if (!token) return res.status(401).json({ message: 'Please log in before managing reviews.' });
  try {
    req.user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
});
app.use('/customer', customerRoutes);
app.use('/', generalRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ message: 'Request body must be valid JSON.' });
  }
  console.error(error.message);
  res.status(500).json({ message: 'An internal server error occurred.' });
});
if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  app.listen(port, '127.0.0.1', () => console.log('Book review server listening on http://127.0.0.1:' + port));
}
module.exports = app;
