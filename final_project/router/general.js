const express = require('express');
const axios = require('axios');
const { randomBytes, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const books = require('./booksdb');
const { isValid, users } = require('./auth_users');
const deriveKey = promisify(scrypt);
const public_users = express.Router();

public_users.post('/register', async (req, res, next) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  const name = username.trim();
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
    return res.status(400).json({ message: 'Use 1-40 letters, numbers, underscores or hyphens for the username.' });
  }
  if (password.length > 256) return res.status(400).json({ message: 'Password is too long.' });
  if (isValid(name)) return res.status(409).json({ message: 'Username already exists.' });
  try {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await deriveKey(password, salt, 64)).toString('hex');
    // Check again after the asynchronous hash to prevent concurrent duplicate registration.
    if (isValid(name)) return res.status(409).json({ message: 'Username already exists.' });
    users.push({ username: name, salt, passwordHash });
    return res.status(201).json({ message: 'User successfully registered. You can now log in.', username: name });
  } catch (error) { next(error); }
});

// Public REST endpoints use the supplied IBM booksdb.js without changing its catalog.
public_users.get('/', (req, res) => res.json(books));
public_users.get('/isbn/:isbn', (req, res) => {
  const book = Object.hasOwn(books, req.params.isbn) ? books[req.params.isbn] : null;
  return book ? res.json(book) : res.status(404).json({ message: 'Book not found.' });
});
public_users.get('/author/:author', (req, res) => {
  const author = req.params.author.trim().toLowerCase();
  const matches = Object.fromEntries(Object.entries(books).filter(([, book]) => book.author.toLowerCase() === author));
  return Object.keys(matches).length ? res.json(matches) : res.status(404).json({ message: 'No books found for this author.' });
});
public_users.get('/title/:title', (req, res) => {
  const title = req.params.title.trim().toLowerCase();
  const matches = Object.fromEntries(Object.entries(books).filter(([, book]) => book.title.toLowerCase() === title));
  return Object.keys(matches).length ? res.json(matches) : res.status(404).json({ message: 'No books found for this title.' });
});
public_users.get('/review/:isbn', (req, res) => {
  const book = Object.hasOwn(books, req.params.isbn) ? books[req.params.isbn] : null;
  return book ? res.json(book.reviews) : res.status(404).json({ message: 'Book not found.' });
});

// Async Axios client methods: these make non-blocking HTTP calls to the REST API.
// They are separate from route handlers, so they never recursively call themselves.
const api = axios.create({
  baseURL: process.env.BOOK_API_URL || 'http://127.0.0.1:' + (process.env.PORT || 5000),
  timeout: 5000,
  proxy: false
});

// Retrieve all books using async/await.
async function getAllBooks() {
  const response = await api.get('/');
  return response.data;
}

// Search by ISBN using an explicit Promise and Axios callbacks.
function getBookByISBN(isbn) {
  return new Promise((resolve, reject) => {
    api.get('/isbn/' + encodeURIComponent(isbn))
      .then(response => resolve(response.data))
      .catch(reject);
  });
}

// Search by author using Promise callbacks.
function getBooksByAuthor(author) {
  return api.get('/author/' + encodeURIComponent(author)).then(response => response.data);
}

// Search by title using async/await.
async function getBooksByTitle(title) {
  const response = await api.get('/title/' + encodeURIComponent(title));
  return response.data;
}

module.exports = { general: public_users, getAllBooks, getBookByISBN, getBooksByAuthor, getBooksByTitle };

// Optional CLI demonstration: keep the server running, then run node router/general.js.
if (require.main === module) {
  Promise.all([
    getAllBooks(), getBookByISBN('1'), getBooksByAuthor('Unknown'),
    getBooksByTitle('Things Fall Apart')
  ]).then(([allBooks, byISBN, byAuthor, byTitle]) => {
    console.log(JSON.stringify({ allBooks, byISBN, byAuthor, byTitle }, null, 2));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
