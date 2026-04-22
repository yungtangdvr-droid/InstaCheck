-- ============================================================
-- Creator Hub — Migration 0003 : Cal.com bookings (Sprint 10)
-- ============================================================
-- Additive only. Adds a single nullable column to `opportunities`
-- to expose a public booking URL in the deal detail view.
--
-- The Cal.com integration itself is webhook-only and never writes
-- to this column — the operator fills it manually when attaching
-- a Cal.com link to a specific opportunity.

alter table opportunities add column booking_url text;
