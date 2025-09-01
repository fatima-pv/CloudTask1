// server.js
// REST API with Node.js + Express + SQLite3 (GET, POST, PUT, PATCH, DELETE)

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.sqlite');

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Database connection
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
    process.exit(1);
  }
  console.log('SQLite database file:', DB_FILE);
});

// Schema initialization
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `);
});

// Helper functions (Promise-based)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Routes
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/todos', async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, title, description, completed, created_at, updated_at
      FROM todos
      ORDER BY id DESC
    `);
    res.json(rows.map(r => ({ ...r, completed: Boolean(r.completed) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/todos/:id', async (req, res) => {
  try {
    const row = await get(`
      SELECT id, title, description, completed, created_at, updated_at
      FROM todos
      WHERE id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.completed = Boolean(row.completed);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/todos', async (req, res) => {
  try {
    const { title, description = '', completed = false } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Field "title" (string) is required' });
    }
    const completedInt = completed ? 1 : 0;
    const now = new Date().toISOString();
    const r = await run(`
      INSERT INTO todos (title, description, completed, updated_at)
      VALUES (?, ?, ?, ?)
    `, [title, description, completedInt, now]);
    const created = await get(`
      SELECT id, title, description, completed, created_at, updated_at
      FROM todos
      WHERE id = ?
    `, [r.lastID]);
    created.completed = Boolean(created.completed);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/todos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await get(`SELECT * FROM todos WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { title, description = '', completed } = req.body;
    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'PUT requires "title" (string)' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'PUT requires "completed" (boolean)' });
    }
    const now = new Date().toISOString();
    await run(`
      UPDATE todos
      SET title = ?, description = ?, completed = ?, updated_at = ?
      WHERE id = ?
    `, [title, description, completed ? 1 : 0, now, id]);
    const updated = await get(`
      SELECT id, title, description, completed, created_at, updated_at
      FROM todos
      WHERE id = ?
    `, [id]);
    updated.completed = Boolean(updated.completed);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/todos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await get(`SELECT * FROM todos WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const fields = [];
    const params = [];

    if (typeof req.body.title === 'string') {
      fields.push('title = ?'); params.push(req.body.title);
    }
    if (typeof req.body.description === 'string') {
      fields.push('description = ?'); params.push(req.body.description);
    }
    if (typeof req.body.completed === 'boolean') {
      fields.push('completed = ?'); params.push(req.body.completed ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields in PATCH. Use "title", "description" or "completed".' });
    }

    fields.push('updated_at = ?'); params.push(new Date().toISOString());
    params.push(id);

    await run(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await get(`
      SELECT id, title, description, completed, created_at, updated_at
      FROM todos
      WHERE id = ?
    `, [id]);
    updated.completed = Boolean(updated.completed);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/todos/:id', async (req, res) => {
  try {
    const result = await run(`DELETE FROM todos WHERE id = ?`, [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
