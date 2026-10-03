-- Forgot password / password reset was removed from EventFlow. This drops what migrations 016 and 017 created
-- for it: the reset token table (it holds only hashed, expired-or-used tokens) and the column that was used to
-- sign out older sessions after a reset. Email verification and its tokens are not touched.
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS password_resets;
ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
