USE skillswap;

SET @has_profile_picture = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'
);
SET @profile_picture_sql = IF(
  @has_profile_picture = 0,
  'ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) NULL AFTER avatar',
  'SELECT 1'
);
PREPARE profile_picture_stmt FROM @profile_picture_sql;
EXECUTE profile_picture_stmt;
DEALLOCATE PREPARE profile_picture_stmt;

CREATE OR REPLACE VIEW v_leaderboard AS
SELECT user_id, name, department, bio, profile_picture, avg_rating, swap_count,
  RANK() OVER (ORDER BY avg_rating DESC, swap_count DESC) AS rank_pos
FROM users WHERE swap_count > 0 ORDER BY rank_pos;
