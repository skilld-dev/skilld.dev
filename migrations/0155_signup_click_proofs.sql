-- Single-use proof for anonymous browser click evidence.
CREATE TABLE signup_click_proofs (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_signup_click_proofs_expiry ON signup_click_proofs(expires_at);
