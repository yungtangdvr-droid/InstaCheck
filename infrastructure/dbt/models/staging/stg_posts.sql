-- stg_posts : typed view over public.posts with derived time columns
--
-- Canonical timezone for Creator Hub is Europe/Paris (operator TZ). All
-- day-of-week / hour-of-day derivations downstream (mart_best_posting_windows
-- in particular) must use `posted_at_local`, never raw UTC `posted_at`.
select
  p.id                                                       as post_id,
  p.account_id,
  p.media_id,
  p.media_type,
  p.caption,
  p.permalink,
  p.posted_at,
  (p.posted_at at time zone 'Europe/Paris')                  as posted_at_local,
  (p.posted_at at time zone 'Europe/Paris')::date            as posted_date_local,
  extract(isodow from p.posted_at at time zone 'Europe/Paris')::int as posted_dow,
  extract(hour   from p.posted_at at time zone 'Europe/Paris')::int as posted_hour,
  (p.posted_at >= now() - interval '7 days')                 as in_last_7d,
  (p.posted_at >= now() - interval '30 days')                as in_last_30d,
  (p.posted_at >= now() - interval '90 days')                as in_last_90d
from {{ source('public', 'posts') }} p
