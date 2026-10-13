USE skillswap;

-- Keep the database column aligned with the 254-character email validator.
ALTER TABLE users MODIFY email VARCHAR(254) NOT NULL;
