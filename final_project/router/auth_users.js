const express = require('express');
const jwt = require('jsonwebtoken');
const { scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { jwtSecret } = require('../config');
const books = require('./booksdb');
const deriveKey = promisify(scrypt);
const regd_users = express.Router();
const users = [];

// Usernames are unique, so each user owns one review per book.
const isValid = username => users.some(user => user.username === username);
const authenticatedUser = async (username, password) => {
  const user = users.find(user => user.username === username);
  if (!user || typeof password !== 'string') return false;
  const candidate = await deriveKey(password, user.salt, 64);
  return timingSafeEqual(candidate, Buffer.from(user.passwordHash, 'hex'));
};

regd_users.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    if (!(await authenticatedUser(username.trim(), password))) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.authorization = {
        accessToken: jwt.sign({ username: username.trim() }, jwtSecret, { algorithm: 'HS256', expiresIn: '1h' })
      };
      req.session.save(error => {
        if (error) return next(error);
        res.json({ message: 'User successfully logged in.', username: username.trim() });
      });
    });
  } catch (error) { next(error); }
});

regd_users.put('/auth/review/:isbn', (req, res) => {
  const book = Object.hasOwn(books, req.params.isbn) ? books[req.params.isbn] : null;
  if (!book) return res.status(404).json({ message: 'Book not found.' });
  const review = req.query.review ?? req.body.review;
  if (typeof review !== 'string' || !review.trim()) {
    return res.status(400).json({ message: 'A non-empty review is required.' });
  }
  const username = req.user.username;
  const existed = Object.hasOwn(book.reviews, username);
  Object.defineProperty(book.reviews, username, {
    value: review.trim(), writable: true, enumerable: true, configurable: true
  });
  return res.json({
    message: existed ? 'Review updated successfully.' : 'Review added successfully.',
    isbn: req.params.isbn, reviews: book.reviews
  });
});

regd_users.delete('/auth/review/:isbn', (req, res) => {
  const book = Object.hasOwn(books, req.params.isbn) ? books[req.params.isbn] : null;
  if (!book) return res.status(404).json({ message: 'Book not found.' });
  const username = req.user.username;
  if (!Object.hasOwn(book.reviews, username)) {
    return res.status(404).json({ message: 'You have no review for this book.' });
  }
  delete book.reviews[username];
  return res.json({ message: 'Review deleted successfully.', isbn: req.params.isbn, reviews: book.reviews });
});

module.exports = { authenticated: regd_users, isValid, authenticatedUser, users };
