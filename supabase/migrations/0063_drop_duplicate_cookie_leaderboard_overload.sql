-- The previous migration's `create or replace function get_cookie_leaderboard(p_limit
-- integer default 3)` did not replace the original zero-argument get_cookie_leaderboard()
-- — Postgres matches CREATE OR REPLACE by exact parameter signature, and `()` vs `(p_limit
-- integer)` are different signatures, so it created a second overload instead. Calling the
-- RPC with no arguments (as employee-pwa's LeaderboardCards.tsx does) then became
-- ambiguous between the two overloads and errored, silently rendering the leaderboard
-- empty. Drop the now-redundant zero-arg version so only the one with the default remains.
drop function if exists public.get_cookie_leaderboard();
