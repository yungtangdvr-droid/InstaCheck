-- ============================================================
-- Creator Hub — Migration 0012 : Meme Radar quality loop
-- ============================================================
-- Adds RSS-provided thumbnail URLs to the Meme Radar pipeline so
-- the feed UI can render an image alongside each card. Strictly
-- additive: two nullable columns, plus a best-effort backfill of
-- existing rows by reading the already-stored `raw_json` payload.
-- No new tables, no enum changes, no RLS changes.
--
-- Caption-direction ideas (PR 5) live inside
-- `radar_item_scores.analysis_json -> 'caption_ideas'` and do NOT
-- need a column. The Yugnat taste profile is a prompt-time input
-- only and is also out of schema scope.
--
-- Backfill notes:
--   - Best-effort: any path miss simply leaves `image_url` null,
--     which the UI handles by rendering no thumbnail.
--   - Order mirrors `pickImageUrl` in apps/web/lib/radar/fetch-rss.ts:
--     enclosure → media:content → media:thumbnail → itunes:image →
--     image. Keep the two in lockstep when adding a new carrier.

alter table raw_radar_items add column image_url text;
alter table radar_items     add column image_url text;

-- Backfill raw_radar_items.image_url from existing raw_json.
-- rss-parser normalizes `enclosure` to a top-level object and stores
-- namespaced fields (media:*, itunes:*) with `$` for attributes.
update raw_radar_items
set image_url = coalesce(
  nullif(raw_json #>> '{enclosure,url}',          ''),
  nullif(raw_json #>> '{media:content,$,url}',    ''),
  nullif(raw_json #>> '{media:thumbnail,$,url}',  ''),
  nullif(raw_json #>> '{itunes:image,$,href}',    ''),
  nullif(raw_json #>> '{image,url}',              '')
)
where image_url is null
  and raw_json is not null;

-- Backfill radar_items.image_url from the joined raw row so cards
-- already in the feed get thumbnails the moment the migration lands.
update radar_items ri
set image_url = rri.image_url
from raw_radar_items rri
where ri.raw_item_id = rri.id
  and ri.image_url is null
  and rri.image_url is not null;
