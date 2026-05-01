-- ============================================================
-- Creator Hub — Migration 0013 : Meme Radar image_url backfill fix
-- ============================================================
-- 0012 added image_url columns and a best-effort backfill, but the
-- json paths it targeted (media:content.$.url, media:thumbnail.$.url,
-- itunes:image.$.href, image.url) do not exist on the payload that
-- rss-parser actually produces. By default rss-parser only copies a
-- fixed set of fields onto its processed item, and namespaced fields
-- like `media:content` are not in that list — they are flattened to
-- `mediaContent` (single attr object) and `itunes.image` (string)
-- respectively, while `media:thumbnail` / `image` are dropped entirely.
--
-- After 0013 the ingest path (apps/web/lib/radar/fetch-rss.ts) opts in
-- to keepArray:true customFields so future rows store the full xml2js
-- shape. This migration re-runs the backfill against the union of
-- legacy (rss-parser-flattened) and new (xml2js array) shapes so cards
-- ingested before 0013 get thumbnails too.
--
-- Strictly additive: no schema changes, no row deletions. Any path
-- miss leaves image_url null, which the UI handles gracefully.

update raw_radar_items
set image_url = coalesce(
  -- enclosure: rss-parser flattens to { url, type, length }.
  nullif(raw_json #>> '{enclosure,url}', ''),

  -- media:content as preserved array of { $: { url, ... } }.
  nullif(raw_json #>> '{media:content,0,$,url}', ''),
  -- media:content as single object (legacy / flat shape).
  nullif(raw_json #>> '{media:content,$,url}', ''),
  nullif(raw_json #>> '{media:content,url}', ''),
  -- mediaContent: rss-parser's camelcase alias (single attr object).
  nullif(raw_json #>> '{mediaContent,url}', ''),

  -- media:thumbnail in either array or object form.
  nullif(raw_json #>> '{media:thumbnail,0,$,url}', ''),
  nullif(raw_json #>> '{media:thumbnail,$,url}', ''),
  nullif(raw_json #>> '{media:thumbnail,url}', ''),

  -- itunes:image as preserved array / object with $.href.
  nullif(raw_json #>> '{itunes:image,0,$,href}', ''),
  nullif(raw_json #>> '{itunes:image,$,href}', ''),
  nullif(raw_json #>> '{itunes:image,href}', ''),
  -- rss-parser podcast helper: itunes.image is a flat string.
  nullif(raw_json #>> '{itunes,image}', ''),

  -- image as scalar string, or object with url / href.
  nullif(raw_json #>> '{image}', ''),
  nullif(raw_json #>> '{image,url}', ''),
  nullif(raw_json #>> '{image,href}', ''),
  nullif(raw_json #>> '{image,0,url}', ''),
  nullif(raw_json #>> '{image,0,href}', '')
)
where image_url is null
  and raw_json is not null;

-- Propagate the freshly backfilled image_url onto the deduped
-- radar_items row so the feed UI picks it up immediately.
update radar_items ri
set image_url = rri.image_url
from raw_radar_items rri
where ri.raw_item_id = rri.id
  and ri.image_url is null
  and rri.image_url is not null;
