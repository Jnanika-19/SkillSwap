USE skillswap;

CREATE TABLE IF NOT EXISTS session_materials (
  material_id   INT          PRIMARY KEY AUTO_INCREMENT,
  request_id    INT          NOT NULL,
  author_id     INT          NOT NULL,
  title         VARCHAR(120) NOT NULL,
  description   VARCHAR(1000),
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(80)  NOT NULL UNIQUE,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     BIGINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_materials_request (request_id)
);

CREATE TABLE IF NOT EXISTS session_quizzes (
  quiz_id     INT          PRIMARY KEY AUTO_INCREMENT,
  request_id  INT          NOT NULL,
  author_id   INT          NOT NULL,
  title       VARCHAR(120) NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES swap_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_quizzes_request (request_id)
);

CREATE TABLE IF NOT EXISTS session_quiz_questions (
  question_id   INT          PRIMARY KEY AUTO_INCREMENT,
  quiz_id       INT          NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  choices       JSON         NOT NULL,
  correct_index TINYINT UNSIGNED NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES session_quizzes(quiz_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_quiz_attempts (
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
