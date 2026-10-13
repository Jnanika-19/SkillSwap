USE skillswap;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64)  PRIMARY KEY,
  user_id    INT       NOT NULL,
  expires_at DATETIME  NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
