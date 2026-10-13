-- ============================================================
--  Skill Swap Platform  |  DBMS Project
--  Updated: + session_notes (Idea 3) + skill_completions (Idea 4)
-- ============================================================

DROP DATABASE IF EXISTS skillswap;
CREATE DATABASE skillswap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE skillswap;

-- TABLE 1: users
CREATE TABLE users (
  user_id    INT          PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(254) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  department VARCHAR(60),
  bio        TEXT,
  avatar     VARCHAR(10)  DEFAULT 'AU',
  profile_picture VARCHAR(255),
  avg_rating DECIMAL(3,2) DEFAULT 0.00,
  swap_count INT          DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- One row per active user per calendar day, used to calculate learning streaks.
CREATE TABLE user_activity (
  user_id       INT  NOT NULL,
  activity_date DATE NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE password_reset_tokens (
  token_hash CHAR(64)  PRIMARY KEY,
  user_id    INT       NOT NULL,
  expires_at DATETIME  NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- TABLE 2: skills_offered
CREATE TABLE skills_offered (
  id          INT         PRIMARY KEY AUTO_INCREMENT,
  user_id     INT         NOT NULL,
  skill_name  VARCHAR(80) NOT NULL,
  proficiency ENUM('beginner','intermediate','expert') DEFAULT 'intermediate',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_offered (user_id, skill_name)
);

-- TABLE 3: skills_requested
CREATE TABLE skills_requested (
  id         INT         PRIMARY KEY AUTO_INCREMENT,
  user_id    INT         NOT NULL,
  skill_name VARCHAR(80) NOT NULL,
  urgency    ENUM('low','medium','high') DEFAULT 'medium',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_requested (user_id, skill_name)
);

-- TABLE 4: matches
CREATE TABLE matches (
  match_id    INT      PRIMARY KEY AUTO_INCREMENT,
  user_a      INT      NOT NULL,
  user_b      INT      NOT NULL,
  match_score INT      DEFAULT 0,
  status      ENUM('suggested','accepted','rejected') DEFAULT 'suggested',
  matched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_a) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (user_b) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_match (user_a, user_b)
);

-- TABLE 5: swap_requests
CREATE TABLE swap_requests (
  request_id      INT         PRIMARY KEY AUTO_INCREMENT,
  from_user       INT         NOT NULL,
  to_user         INT         NOT NULL,
  offered_skill   VARCHAR(80) NOT NULL,
  requested_skill VARCHAR(80) NOT NULL,
  message         TEXT,
  status          ENUM('pending','accepted','declined','completed') DEFAULT 'pending',
  created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (to_user)   REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id         INT NOT NULL,
  request_id      INT,
  title           VARCHAR(100) NOT NULL,
  message         VARCHAR(255) NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, is_read, created_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE
);

-- TABLE 6: ratings
CREATE TABLE ratings (
  rating_id  INT  PRIMARY KEY AUTO_INCREMENT,
  request_id INT  NOT NULL,
  rater_id   INT  NOT NULL,
  ratee_id   INT  NOT NULL,
  score      INT  NOT NULL,
  comment    TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_score CHECK (score BETWEEN 1 AND 5),
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (rater_id)   REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (ratee_id)   REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_rating (request_id, rater_id)
);

-- ============================================================
-- TABLE 7: session_notes  [IDEA 3 - Progress Tracker]
-- Both users log topics covered after each teaching session.
-- session_no tracks how many sessions have happened (1,2,3...)
-- ============================================================
CREATE TABLE session_notes (
  note_id      INT          PRIMARY KEY AUTO_INCREMENT,
  request_id   INT          NOT NULL,
  author_id    INT          NOT NULL,
  session_no   INT          NOT NULL DEFAULT 1,
  topic        VARCHAR(200) NOT NULL,
  notes        TEXT,
  resources    TEXT,
  duration_min INT          DEFAULT 60,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id)  REFERENCES users(user_id) ON DELETE CASCADE
);

-- Private files and quizzes shared within an accepted or completed swap.
CREATE TABLE session_materials (
  material_id  INT          PRIMARY KEY AUTO_INCREMENT,
  request_id   INT          NOT NULL,
  author_id    INT          NOT NULL,
  title        VARCHAR(120) NOT NULL,
  description  VARCHAR(1000),
  original_name VARCHAR(255) NOT NULL,
  stored_name  VARCHAR(80)  NOT NULL UNIQUE,
  mime_type    VARCHAR(100) NOT NULL,
  file_size    BIGINT UNSIGNED NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_materials_request (request_id)
);

CREATE TABLE session_quizzes (
  quiz_id      INT          PRIMARY KEY AUTO_INCREMENT,
  request_id   INT          NOT NULL,
  author_id    INT          NOT NULL,
  title        VARCHAR(120) NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_quizzes_request (request_id)
);

CREATE TABLE session_quiz_questions (
  question_id  INT          PRIMARY KEY AUTO_INCREMENT,
  quiz_id      INT          NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  choices      JSON         NOT NULL,
  correct_index TINYINT UNSIGNED NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES session_quizzes(quiz_id) ON DELETE CASCADE
);

CREATE TABLE session_quiz_attempts (
  attempt_id   INT          PRIMARY KEY AUTO_INCREMENT,
  quiz_id      INT          NOT NULL,
  user_id      INT          NOT NULL,
  score        SMALLINT UNSIGNED NOT NULL,
  total        SMALLINT UNSIGNED NOT NULL,
  submitted_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES session_quizzes(quiz_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_quiz_attempt_user (quiz_id, user_id, submitted_at)
);

-- ============================================================
-- TABLE 8: skill_completions  [IDEA 4 - Completion Certificate]
-- Auto-created by TRIGGER when both users rate >= 3 stars.
-- Also auto-removes the learned skill from skills_requested.
-- ============================================================
CREATE TABLE skill_completions (
  completion_id  INT          PRIMARY KEY AUTO_INCREMENT,
  request_id     INT          NOT NULL,
  learner_id     INT          NOT NULL,
  teacher_id     INT          NOT NULL,
  skill_learned  VARCHAR(80)  NOT NULL,
  skill_taught   VARCHAR(80)  NOT NULL,
  avg_score      DECIMAL(3,2),
  total_sessions INT          DEFAULT 0,
  completed_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_completion (request_id, learner_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_so_skill     ON skills_offered(skill_name);
CREATE INDEX idx_sr_skill     ON skills_requested(skill_name);
CREATE INDEX idx_swap_status  ON swap_requests(status);
CREATE INDEX idx_matches_ua   ON matches(user_a);
CREATE INDEX idx_matches_ub   ON matches(user_b);
CREATE INDEX idx_notes_req    ON session_notes(request_id);
CREATE INDEX idx_notes_author ON session_notes(author_id);
CREATE INDEX idx_comp_learner ON skill_completions(learner_id);
CREATE INDEX idx_comp_teacher ON skill_completions(teacher_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
DELIMITER //

-- Trigger 1: Auto-update avg_rating on new rating
CREATE TRIGGER trg_update_avg_rating
AFTER INSERT ON ratings FOR EACH ROW
BEGIN
  UPDATE users
  SET avg_rating = (SELECT ROUND(AVG(score),2) FROM ratings WHERE ratee_id = NEW.ratee_id)
  WHERE user_id = NEW.ratee_id;
END//

-- Trigger 2: Increment swap_count when completed
CREATE TRIGGER trg_swap_count
AFTER UPDATE ON swap_requests FOR EACH ROW
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE users SET swap_count = swap_count + 1 WHERE user_id = NEW.from_user;
    UPDATE users SET swap_count = swap_count + 1 WHERE user_id = NEW.to_user;
  END IF;
END//

-- Trigger 3: Auto-create skill_completions when BOTH users rate >= 3
-- Also removes the learned skill from skills_requested automatically
CREATE TRIGGER trg_skill_completion
AFTER INSERT ON ratings FOR EACH ROW
BEGIN
  DECLARE v_from_user  INT;
  DECLARE v_to_user    INT;
  DECLARE v_offered    VARCHAR(80);
  DECLARE v_requested  VARCHAR(80);
  DECLARE v_rating1    INT DEFAULT 0;
  DECLARE v_rating2    INT DEFAULT 0;
  DECLARE v_avg        DECIMAL(3,2);
  DECLARE v_sessions   INT DEFAULT 0;
  DECLARE v_count      INT DEFAULT 0;

  SELECT from_user, to_user, offered_skill, requested_skill
  INTO   v_from_user, v_to_user, v_offered, v_requested
  FROM   swap_requests WHERE request_id = NEW.request_id;

  SELECT COUNT(*) INTO v_sessions FROM session_notes WHERE request_id = NEW.request_id;
  SELECT COUNT(*) INTO v_count    FROM ratings         WHERE request_id = NEW.request_id;

  IF v_count = 2 THEN
    SELECT score INTO v_rating1 FROM ratings WHERE request_id = NEW.request_id AND rater_id = v_from_user LIMIT 1;
    SELECT score INTO v_rating2 FROM ratings WHERE request_id = NEW.request_id AND rater_id = v_to_user   LIMIT 1;
    SET v_avg = ROUND((v_rating1 + v_rating2) / 2.0, 2);

    IF v_rating1 >= 3 AND v_rating2 >= 3 THEN
      -- from_user learned v_requested FROM to_user
      INSERT IGNORE INTO skill_completions
        (request_id, learner_id, teacher_id, skill_learned, skill_taught, avg_score, total_sessions)
      VALUES (NEW.request_id, v_from_user, v_to_user, v_requested, v_offered, v_avg, v_sessions);

      -- to_user learned v_offered FROM from_user
      INSERT IGNORE INTO skill_completions
        (request_id, learner_id, teacher_id, skill_learned, skill_taught, avg_score, total_sessions)
      VALUES (NEW.request_id, v_to_user, v_from_user, v_offered, v_requested, v_avg, v_sessions);

      -- Auto-remove learned skills from skills_requested
      DELETE FROM skills_requested WHERE user_id = v_from_user AND skill_name = v_requested;
      DELETE FROM skills_requested WHERE user_id = v_to_user   AND skill_name = v_offered;
    END IF;
  END IF;
END//

DELIMITER ;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE VIEW v_pending_requests AS
SELECT sr.request_id,
  u1.user_id AS from_id, u1.name AS from_name, u1.department AS from_dept,
  u2.user_id AS to_id,   u2.name AS to_name,   u2.department AS to_dept,
  sr.offered_skill, sr.requested_skill, sr.message, sr.created_at
FROM swap_requests sr
JOIN users u1 ON u1.user_id = sr.from_user
JOIN users u2 ON u2.user_id = sr.to_user
WHERE sr.status = 'pending';

CREATE VIEW v_leaderboard AS
SELECT user_id, name, department, bio, profile_picture, avg_rating, swap_count,
  RANK() OVER (ORDER BY avg_rating DESC, swap_count DESC) AS rank_pos
FROM users WHERE swap_count > 0 ORDER BY rank_pos;

-- View: Session progress summary per swap (Idea 3)
CREATE VIEW v_session_progress AS
SELECT
  sn.request_id,
  sr.offered_skill, sr.requested_skill,
  u1.name AS from_name, u2.name AS to_name,
  COUNT(sn.note_id)    AS total_notes,
  MAX(sn.session_no)   AS sessions_done,
  SUM(sn.duration_min) AS total_minutes,
  MAX(sn.created_at)   AS last_session
FROM session_notes sn
JOIN swap_requests sr ON sr.request_id = sn.request_id
JOIN users u1 ON u1.user_id = sr.from_user
JOIN users u2 ON u2.user_id = sr.to_user
GROUP BY sn.request_id, sr.offered_skill, sr.requested_skill, u1.name, u2.name;

-- View: Full completion certificates (Idea 4)
CREATE VIEW v_skill_completions AS
SELECT
  sc.completion_id, sc.skill_learned, sc.skill_taught,
  sc.avg_score, sc.total_sessions, sc.completed_at,
  u1.name AS learner_name, u1.department AS learner_dept,
  u2.name AS teacher_name, u2.department AS teacher_dept
FROM skill_completions sc
JOIN users u1 ON u1.user_id = sc.learner_id
JOIN users u2 ON u2.user_id = sc.teacher_id
ORDER BY sc.completed_at DESC;

-- ============================================================
-- SAMPLE DATA
-- ============================================================
INSERT INTO users (name, email, password, department, bio, avatar) VALUES
('Ayesha Khan',  'ayesha@college.edu', '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'Computer Science', 'ML enthusiast', 'AK'),
('Rohan Sharma', 'rohan@college.edu',  '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'Design',           'UI/UX designer', 'RS'),
('Priya Nair',   'priya@college.edu',  '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'MBA',              'Marketing wizard', 'PN'),
('Arjun Mehta',  'arjun@college.edu',  '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'Computer Science', 'Full-stack dev', 'AM'),
('Sara Ahmed',   'sara@college.edu',   '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'Electronics',      'Embedded systems', 'SA'),
('Dev Patel',    'dev@college.edu',    '$2a$10$fM2mK5qeZt1Re5OdfP7PFuTmGgb1iKt/WmDGKwIm/fydGgoGz6A6.', 'Computer Science', 'DevOps engineer', 'DP');

INSERT INTO skills_offered (user_id, skill_name, proficiency) VALUES
(1,'Python','expert'),(1,'Machine Learning','expert'),(1,'Data Analysis','intermediate'),
(2,'Figma','expert'),(2,'UI/UX Design','expert'),(2,'Adobe Illustrator','intermediate'),
(3,'Excel','expert'),(3,'Marketing','expert'),(3,'PowerPoint','intermediate'),
(4,'React','expert'),(4,'Node.js','expert'),(4,'MongoDB','intermediate'),
(5,'Arduino','expert'),(5,'PCB Design','expert'),(5,'C++','intermediate'),
(6,'Docker','expert'),(6,'AWS','intermediate'),(6,'Linux','expert');

INSERT INTO skills_requested (user_id, skill_name, urgency) VALUES
(1,'UI/UX Design','medium'),(1,'React','low'),
(2,'Machine Learning','medium'),
(3,'Python','medium'),(3,'Figma','low'),(3,'React','high'),
(4,'Machine Learning','high'),(4,'Docker','medium'),
(5,'Python','high'),(5,'React','medium'),
(6,'Machine Learning','medium'),(6,'React','low');

INSERT INTO swap_requests (from_user,to_user,offered_skill,requested_skill,message,status) VALUES
(1,2,'Python','Figma','Hi Rohan! I can teach you Python if you help me with Figma basics.','completed'),
(2,1,'Figma','Machine Learning','Would love to learn ML from you, Ayesha!','completed'),
(4,1,'React','Machine Learning','Looking to swap React for ML knowledge.','accepted'),
(3,4,'Excel','React','I need React for my project, happy to teach Excel!','pending'),
(5,1,'Arduino','Python','Want to learn Python for automation projects.','pending');

-- Session notes for swap #3 (active: Arjun teaches React to Ayesha & vice versa)
INSERT INTO session_notes (request_id, author_id, session_no, topic, notes, resources, duration_min) VALUES
(3,4,1,'React Basics - Components & JSX',
 'Covered what React is, functional components, JSX syntax. Ayesha built her first Hello World component.',
 'https://react.dev/learn',60),
(3,1,1,'Machine Learning Introduction',
 'Explained supervised vs unsupervised learning. Arjun ran his first linear regression.',
 'https://scikit-learn.org',60),
(3,4,2,'React Hooks - useState & useEffect',
 'Built a counter and a data-fetching component together.',
 'https://react.dev/reference/react/useState',75),
(3,1,2,'Python for ML - NumPy & Pandas',
 'Introduced NumPy arrays and Pandas DataFrames. Loaded a CSV and did analysis.',
 'https://pandas.pydata.org/docs',75);

-- Ratings for completed swaps
INSERT INTO ratings (request_id,rater_id,ratee_id,score,comment) VALUES
(1,2,1,5,'Ayesha explained Python so clearly! Highly recommend.'),
(2,1,2,4,'Rohan is a great Figma teacher, very patient.');

-- Manually insert completions for demo (trigger handles this in live use)
INSERT INTO skill_completions (request_id,learner_id,teacher_id,skill_learned,skill_taught,avg_score,total_sessions) VALUES
(1,1,2,'Figma','Python',4.50,3),
(2,2,1,'Machine Learning','Figma',4.50,3);
