const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const books = require('../router/booksdb');

test('bookstore API and asynchronous Axios clients', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  process.env.BOOK_API_URL = base;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (path, method = 'GET', body, cookie) => {
    const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  let cookieA, cookieB;
  await t.test('all supplied books, ISBN, author, title and initial reviews', async () => {
    const all = await request('/');
    assert.equal(all.status, 200); assert.deepEqual(all.body, books);
    assert.equal((await request('/isbn/1')).body.title, 'Things Fall Apart');
    assert.equal(Object.keys((await request('/author/Unknown')).body).length, 4);
    assert.equal((await request('/title/' + encodeURIComponent('Pride and Prejudice'))).body['8'].author, 'Jane Austen');
    assert.deepEqual((await request('/review/1')).body, {});
    assert.equal((await request('/isbn/999')).status, 404);
    assert.equal((await request('/author/NoSuchAuthor')).status, 404);
    assert.equal((await request('/title/NoSuchTitle')).status, 404);
  });
  await t.test('registration validation and concurrent duplicate prevention', async () => {
    assert.equal((await request('/register', 'POST', {})).status, 400);
    const results = await Promise.all([1, 2].map(() => request('/register', 'POST', { username: 'parallel_reader', password: 'DemoOnly-123' })));
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert.equal((await request('/register', 'POST', { username: 'reader_a', password: 'DemoOnly-A' })).status, 201);
    assert.equal((await request('/register', 'POST', { username: 'reader_b', password: 'DemoOnly-B' })).status, 201);
  });
  await t.test('authentication protects review changes', async () => {
    assert.equal((await request('/customer/auth/review/1', 'PUT', { review: 'unauthorized' })).status, 401);
    assert.equal((await request('/customer/login', 'POST', { username: 'reader_a', password: 'wrong' })).status, 401);
    const a = await request('/customer/login', 'POST', { username: 'reader_a', password: 'DemoOnly-A' });
    const b = await request('/customer/login', 'POST', { username: 'reader_b', password: 'DemoOnly-B' });
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.ok(a.cookie); assert.ok(b.cookie);
    cookieA = a.cookie; cookieB = b.cookie;
  });
  await t.test('concurrent reviews, own-review update and deletion', async () => {
    const results = await Promise.all([
      request('/customer/auth/review/1', 'PUT', { review: 'A review' }, cookieA),
      request('/customer/auth/review/1', 'PUT', { review: 'B review' }, cookieB)
    ]);
    assert.ok(results.every(result => result.status === 200));
    assert.deepEqual((await request('/review/1')).body, { reader_a: 'A review', reader_b: 'B review' });
    const updated = await request('/customer/auth/review/1?review=Updated%20review', 'PUT', undefined, cookieA);
    assert.equal(updated.body.reviews.reader_a, 'Updated review');
    assert.equal(updated.body.reviews.reader_b, 'B review');
    assert.equal((await request('/customer/auth/review/1', 'PUT', { review: '' }, cookieA)).status, 400);
    assert.equal((await request('/customer/auth/review/999', 'PUT', { review: 'missing' }, cookieA)).status, 404);
    assert.equal((await request('/customer/auth/review/1', 'DELETE', undefined, cookieA)).status, 200);
    assert.deepEqual((await request('/review/1')).body, { reader_b: 'B review' });
    assert.equal((await request('/customer/auth/review/1', 'DELETE', undefined, cookieA)).status, 404);
    await request('/customer/auth/review/1', 'DELETE', undefined, cookieB);
    assert.deepEqual((await request('/review/1')).body, {});
  });
  await t.test('special usernames remain ordinary review keys', async () => {
    assert.equal((await request('/register', 'POST', { username: '__proto__', password: 'DemoOnly-Proto' })).status, 201);
    const login = await request('/customer/login', 'POST', { username: '__proto__', password: 'DemoOnly-Proto' });
    assert.equal(login.status, 200);
    const result = await request('/customer/auth/review/1', 'PUT', { review: 'A valid review' }, login.cookie);
    assert.equal(result.status, 200); assert.ok(Object.hasOwn(result.body.reviews, '__proto__'));
    assert.equal(result.body.reviews['__proto__'], 'A valid review');
    assert.equal((await request('/customer/auth/review/1', 'DELETE', undefined, login.cookie)).status, 200);
  });
  await t.test('all four Axios helpers work concurrently and propagate errors', async () => {
    // Reload this module so its client uses the ephemeral test server URL.
    delete require.cache[require.resolve('../router/general')];
    const client = require('../router/general');
    const [all, isbn, author, title] = await Promise.all([
      client.getAllBooks(), client.getBookByISBN('1'), client.getBooksByAuthor('Unknown'), client.getBooksByTitle('Things Fall Apart')
    ]);
    assert.equal(Object.keys(all).length, 10); assert.equal(isbn.author, 'Chinua Achebe');
    assert.equal(Object.keys(author).length, 4); assert.equal(title['1'].title, 'Things Fall Apart');
    await assert.rejects(client.getBookByISBN('999'), error => error.response.status === 404);
  });
});
