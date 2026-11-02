-- Contract step for 001's placeholder table (DECISIONS #74, #79). Nothing has read app_meta
-- since Stage 2C replaced the seed check with "no events row", and 2C is live on main, so
-- the current and previous deployments both work without it.
DROP TABLE app_meta;
