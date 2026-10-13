USE skillswap;

CREATE TABLE IF NOT EXISTS user_activity (
  user_id       INT  NOT NULL,
  activity_date DATE NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
