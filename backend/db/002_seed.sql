-- The legal entity types the app knows from the start
-- (LEGAL_ENTITY_TYPES in src/app/diagram/constants.ts).
insert into legal_entity_type (name) values
  ('Private equity'),
  ('Venture capital'),
  ('Hedge fund'),
  ('Private credit'),
  ('Real estate'),
  ('Infrastructure'),
  ('Fund of funds'),
  ('Feeder fund');
