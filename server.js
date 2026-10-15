const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');
const isProduction = process.env.NODE_ENV === 'production';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], reservations: [] }, null, 2));

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { users: Array.isArray(parsed.users) ? parsed.users : [], reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [] };
  } catch (error) {
    console.error('Could not read data/users.json:', error.message);
    throw new Error('The local data file could not be read. Stop the server and check data/users.json.');
  }
}
function writeData(data) {
  const tempFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tempFile, DATA_FILE);
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  name: 'ielts_demo.sid',
  secret: process.env.SESSION_SECRET || 'replace-this-demo-secret-before-deployment-9b34f7e1',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 4 }
}));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait 15 minutes and try again.' } });

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 70) return res.status(400).json({ error: 'Enter a name between 2 and 70 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Your password must be 8–72 characters long.' });

    const data = readData();
    if (data.users.some(user => user.email === email)) return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    const user = {
      id: require('crypto').randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };
    data.users.push(user);
    writeData(data);
    req.session.userId = user.id;
    req.session.save(err => {
      if (err) return res.status(500).json({ error: 'Account created, but the session could not start. Please log in.' });
      res.status(201).json({ message: 'Account created successfully.', user: publicUser(user) });
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const data = readData();
    const user = data.users.find(item => item.email === email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not start your session. Please try again.' });
      req.session.userId = user.id;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: 'Could not save your login session.' });
        res.json({ message: 'You are now logged in.', user: publicUser(user) });
      });
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Could not log in. Please try again.' });
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const data = readData();
  const user = data.users.find(item => item.id === req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null }); }
  const reservations = data.reservations.filter(item => item.userId === user.id).map(({ id, testType, city, date, format, createdAt }) => ({ id, testType, city, date, format, createdAt }));
  res.json({ user: publicUser(user), reservations });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not log out. Please try again.' });
    res.clearCookie('ielts_demo.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.json({ message: 'Logged out.' });
  });
});

app.post('/api/reservations', requireLogin, (req, res) => {
  try {
    const testType = String(req.body.testType || '').trim();
    const city = String(req.body.city || '').trim();
    const date = String(req.body.date || '').trim();
    const format = String(req.body.format || '').trim();
    const allowedTests = ['IELTS Academic', 'IELTS General Training', 'IELTS for UKVI Academic', 'IELTS for UKVI General Training'];
    const allowedCities = ['Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna'];
    const allowedFormats = ['IELTS on computer', 'Not sure yet'];
    if (!allowedTests.includes(testType) || !allowedCities.includes(city) || !allowedFormats.includes(format) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Check the test type, city, date, and format.' });
    }
    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate < today || selectedDate.toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'Choose today or a future date.' });
    const data = readData();
    const reservation = { id: require('crypto').randomUUID(), userId: req.session.userId, testType, city, date, format, createdAt: new Date().toISOString(), status: 'Demo request — not a real booking' };
    data.reservations.push(reservation);
    writeData(data);
    res.status(201).json({ message: 'Your demo request was saved to this computer.', reservation: { id: reservation.id, testType, city, date, format, createdAt: reservation.createdAt, status: reservation.status } });
  } catch (error) {
    console.error('Reservation error:', error.message);
    res.status(500).json({ error: 'Could not save the demo request.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'IELTS student demo' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`IELTS demo website running at http://localhost:${PORT}`);
  console.log(`Local account data file: ${DATA_FILE}`);
  if (isProduction && !process.env.SESSION_SECRET) console.warn('WARNING: Set SESSION_SECRET before production deployment.');
});
