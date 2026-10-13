# SkillSwap

A full stack app for students to exchange skills. Users list skills they can teach and want to learn, discover potential matches, arrange swaps, track sessions, and leave ratings.

## Features

- Account registration and login with bcrypt password hashes and session cookies
- Server-side field validation and per-IP login and registration throttling
- Skill offer and request profiles
- Skill matching and swap request workflow
- Editable student profiles with private uploads for profile photos and a public bio
- Session notes, ratings, completion records, and leaderboard
- Private PDF, video, and text materials shared within swap sessions, plus scored multiple-choice quizzes
- Daily learning streaks, based on successful skill, swap, session, and rating actions
- Installable progressive web app with an offline fallback for the app shell
- In-app notifications for incoming swap requests and request status updates
- MySQL schema with constraints, indexes, triggers, and views
- Responsive navigation, keyboard focus indicators, labeled forms, and reduced-motion support

## Tech stack

Node.js, Express, MySQL, vanilla JavaScript, HTML, and CSS.

## Prerequisites

- **Node.js**: v18.0.0 or higher (`node -v`)
- **MySQL**: Server 8.0 or higher (`mysql --version`)
- **Shell**: Windows PowerShell 5.1+ or PowerShell Core 7+

---

## Setup & Running (Windows PowerShell)

### 1. Environment Configuration

From the repository root, run the setup helper. It prompts for the MySQL root password with hidden input, writes it to the ignored `backend/.env` file, and creates a fresh session secret if the example placeholder is still present:

```powershell
npm.cmd run setup:local
```

The password is not printed. If your MySQL root account has no password, press Enter at the prompt.

> **Security Note:** Keep `backend/.env`, database dumps, backups, and logs out of version control. The repository `.gitignore` ensures sensitive files are ignored.

---

### 2. Database Setup

Choose **Option A** if you already have existing data, or **Option B** for a fresh start:

#### Option A: Existing Database (Safe Non-Destructive Migrations)

If you already have a `skillswap` database with accounts or swap history, **do not run `schema.sql`** (it drops existing tables). Instead, apply the incremental migrations from the repository root:

```powershell
# 1. Session notes, completion certificates, and progress views
Get-Content .\backend\db\migrate_v2.sql | mysql -u root -p

# 2. Single-use 6-digit password reset verification tokens
Get-Content .\backend\db\migrate_password_reset.sql | mysql -u root -p

# 3. Daily activity and learning streaks tracking
Get-Content .\backend\db\migrate_streaks.sql | mysql -u root -p

# 4. In-app notifications table
Get-Content .\backend\db\migrate_notifications.sql | mysql -u root -p

# 5. Allow standards-compliant email addresses up to 254 characters
Get-Content .\backend\db\migrate_email_length.sql | mysql -u root -p

# 6. Private study materials and quiz tables
Get-Content .\backend\db\migrate_learning_materials.sql | mysql -u root -p skillswap

# 7. Profile picture storage and leaderboard profile fields
Get-Content .\backend\db\migrate_profile_picture.sql | mysql -u root -p skillswap
```

#### Option B: Fresh Database Setup

> ⚠️ **Warning:** `schema.sql` drops and recreates the `skillswap` database. Only run this for a brand-new installation or when you wish to reset all sample data:

```powershell
Get-Content .\backend\db\schema.sql | mysql -u root -p
```

Session material uploads support PDF (25 MB max), MP4/WebM/MOV video (100 MB max), and UTF-8 TXT/Markdown (2 MB max). Only participants in accepted or completed swaps can view or share them. Quizzes support up to 20 multiple-choice questions and store each learner's score.

---

### 3. Install Dependencies & Start Server

From the repository root in PowerShell:

```powershell
npm.cmd run install:backend
npm.cmd start
```

*Tip:* If PowerShell script execution policy restricts running `npm.ps1`, invoke `npm.cmd` directly:

```powershell
npm.cmd run install:backend
npm.cmd start
```

For automatic restarts during local development:

```powershell
npm.cmd run dev
```

Open the application in your browser at **`http://localhost:3000`** (or the custom `PORT` specified in `backend/.env`).

---

### 4. Running Automated Tests

The test suite runs using Node.js's built-in test runner (`node --test`) against an in-memory database stub, requiring no running MySQL instance:

```powershell
npm.cmd test
```

The automated tests verify:
- Registration validation, bcrypt hashing, and login authentication.
- Authentication rate limiting (brute-force protection on login and register).
- Single-use 6-digit password reset verification codes.
- Bidirectional skill matching queries.
- Complete swap lifecycle (send, notifications, accept, complete).
- Profile email privacy (emails are hidden from public browse and other users).
- Swap cancellation authorization (only the original sender can cancel pending swaps).
- Bidirectional duplicate prevention (rejects reciprocal pending requests and duplicate requests during active swaps).
- Input payload validators (length limits, integer IDs, rating bounds).

---

## Troubleshooting Guide

- **`mysql` is not recognized as an internal or external command:**
  Add the MySQL `bin` directory to your user `PATH` (typically `C:\Program Files\MySQL\MySQL Server 8.0\bin`), or invoke it with the full executable path:
  ```powershell
  Get-Content .\backend\db\migrate_v2.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
  ```

- **Database connection refused (`ECONNREFUSED` on port 3306):**
  Ensure the MySQL Windows Service is running:
  ```powershell
  Get-Service MySQL* | Start-Service
  ```
  Verify that `DB_HOST`, `DB_USER`, `DB_PASS`, and `DB_NAME` in `backend/.env` match your MySQL credentials.

- **PowerShell blocks script execution (`npm : File ... cannot be loaded`):**
  Run `npm.cmd` instead of `npm`, or start with `node server.js`.

- **`SESSION_SECRET must be set to a random value of at least 32 characters`:**
  The server exits on launch if `SESSION_SECRET` is unset or too short. Generate a key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and save it in `backend/.env`.

- **Port already in use (`EADDRINUSE: address already in use :::3000`):**
  The app may already be running; open `http://localhost:3000`. To restart it, find and stop its process:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess
  Stop-Process -Id <PID>
  npm.cmd start
  ```
  Or change `PORT=3001` in `backend/.env`.

- **Reverse duplicate or pending request error (409 Conflict):**
  SkillSwap enforces bidirectional swap integrity. If User A has already sent a pending request to User B, User B cannot send a reverse request; they should accept or decline User A's incoming request from their Requests page. Likewise, two users cannot initiate a new swap request while an active swap is already in progress.

## Screenshots

Screenshots should be captured from a running app with realistic sample data and added under `docs/screenshots/`. Do not include personal information or credentials in screenshots.

## Project layout

```text
backend/
  db/          MySQL schema and connection pool
  middleware/  Authentication middleware
  routes/      Express API routes
  server.js    App entry point
frontend/
  css/         Styles
  js/          Client app and page modules
  index.html   App shell
```

## Before deployment

Configure a production session secret, use HTTPS, replace the default in-memory session and rate-limit stores with shared persistent stores, use a dedicated least-privilege database account, and remove the public demo accounts. The sample SQL script is for local development and resets the database.

## License

This project is available under the MIT License. See [`LICENSE`](LICENSE).
