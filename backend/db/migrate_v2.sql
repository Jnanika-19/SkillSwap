USE skillswap;

CREATE TABLE IF NOT EXISTS session_notes (
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

CREATE TABLE IF NOT EXISTS skill_completions (
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

DROP VIEW IF EXISTS v_session_progress;
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

DROP VIEW IF EXISTS v_skill_completions;
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

DROP TRIGGER IF EXISTS trg_skill_completion;

DELIMITER //

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
      INSERT IGNORE INTO skill_completions
        (request_id, learner_id, teacher_id, skill_learned, skill_taught, avg_score, total_sessions)
      VALUES (NEW.request_id, v_from_user, v_to_user, v_requested, v_offered, v_avg, v_sessions);

      INSERT IGNORE INTO skill_completions
        (request_id, learner_id, teacher_id, skill_learned, skill_taught, avg_score, total_sessions)
      VALUES (NEW.request_id, v_to_user, v_from_user, v_offered, v_requested, v_avg, v_sessions);

      DELETE FROM skills_requested WHERE user_id = v_from_user AND skill_name = v_requested;
      DELETE FROM skills_requested WHERE user_id = v_to_user   AND skill_name = v_offered;
    END IF;
  END IF;
END//

DELIMITER ;
