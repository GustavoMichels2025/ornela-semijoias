CREATE TABLE IF NOT EXISTS public.reseller_access (
  reseller_id text PRIMARY KEY,
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  salt text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
