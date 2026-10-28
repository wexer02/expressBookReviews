# expressBookReviews

A Node.js and Express online bookstore API based on IBM Developer Skills Network's expressBookReviews starter.

## Run

```bash
cd final_project
npm install
npm start
```

The default server URL is http://127.0.0.1:5000. Set PORT to change it. Node.js 20 or later is required.

## Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | / | All books |
| GET | /isbn/:isbn | Book by ISBN |
| GET | /author/:author | Books by author (case-insensitive exact match) |
| GET | /title/:title | Books by title (case-insensitive exact match) |
| GET | /review/:isbn | Reviews for a book |
| POST | /register | Register with a JSON username and password |
| POST | /customer/login | Log in; save the session cookie |
| PUT | /customer/auth/review/:isbn | Add or replace your own review (JSON body or review query parameter) |
| DELETE | /customer/auth/review/:isbn | Delete only your own review |

The provided catalog at final_project/router/booksdb.js is unchanged. ISBN values are the starter's keys 1 through 10.

## Authentication and concurrency

Passwords are hashed with asynchronous scrypt and per-user salts. JWTs are verified inside the logged-in session. Session cookies are HTTP-only. Each user owns one review per book and cannot delete another user's review. Concurrent registration re-checks username uniqueness after hashing.

This is a local course demo: users, reviews, and sessions are kept in memory and reset on restart. Set JWT_SECRET and SESSION_SECRET for stable session signing across restarts; random secrets are used by default.

## Async Axios methods (Task 11)

final_project/router/general.js exports getAllBooks (async/await), getBookByISBN (Promise callbacks), getBooksByAuthor (Axios Promise callbacks), and getBooksByTitle (async/await). Start the server, then run:

```bash
node router/general.js
```

## Verification

Run `npm test` in final_project to check public routes, registration, login, review ownership, updates/deletion, error cases, concurrent users, and all four Axios methods.

## Upstream name

The assignment text calls the source expressBookReview. The actual public IBM starter is **ibm-developer-skills-network/expressBookReviews** (plural), which this repository forks.
