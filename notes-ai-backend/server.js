const express = require("express");
const app = express();
const dotenv = require("dotenv");
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

app.use(express.json());

dotenv.config();

app.use(express.json()); //application wide muddleware

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Missing token." });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token." });
  }
}

const axios = require("axios");

async function summarizeNote(content) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "user", content: `Summarize this note:\n\n${content}` },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("AI summary error:", err);
    return ""; // fallback to empty if summary fails
  }
}

app.post(
  "/notes",
  authMiddleware,
  [
    body("title").notEmpty().trim().escape().withMessage("Title is required."),
    body("content")
      .notEmpty()
      .trim()
      .escape()
      .withMessage("Content is required."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.userId;
    const { title, content } = req.body;
    const summary = await summarizeNote(content);

    try {
      const result = await pool.query(
        "INSERT INTO notes (title, content, summary, user_id, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *",
        [title, content, summary, userId]
      );

      res
        .status(201)
        .json({ message: "Note saved to database!", note: result.rows[0] });
    } catch (err) {
      console.error("DB insert error:", err);
      res.status(500).json({ message: "Internal server error." });
    }
  }
);

app.post(
  "/signup",
  [
    // Validation middleware array
    body("email").isEmail().withMessage("Enter a valid email."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters."),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
        [email, hashedPassword]
      );

      res.status(201).json({
        message: "Signup successful!",
        user: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error creating user." });
    }
  }
);

const { body, validationResult } = require("express-validator");

app.post(
  "/login",
  [
    body("email").isEmail().withMessage("Enter a valid email."),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const userResult = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      const user = userResult.rows[0];
      if (!user) return res.status(404).json({ message: "User not found." });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid)
        return res.status(401).json({ message: "Incorrect password." });

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.json({ message: "Login successful!", token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error during login." });
    }
  }
);
app.get("/notes", authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const result = await pool.query(
      "SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    res.json({ notes: result.rows });
  } catch (err) {
    console.error("Error fetching notes:", err);
    res.status(500).json({ message: "Could not fetch notes." });
  }
});

app.put("/notes/:id", authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  const { id } = req.params;
  const userId = req.userId;

  if (!title || !content) {
    return res.status(400).json({ message: "Title and content required." });
  }

  try {
    const result = await pool.query(
      "UPDATE notes SET title = $1, content = $2 WHERE id = $3 AND user_id = $4 RETURNING *",
      [title, content, id, userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Note not found or unauthorized." });
    }

    res.json({ message: "Note updated!", note: result.rows[0] });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.delete("/notes/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const result = await pool.query(
      "DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Note not found or unauthorized." });
    }

    res.json({ message: "Note deleted!", deletedNote: result.rows[0] });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
