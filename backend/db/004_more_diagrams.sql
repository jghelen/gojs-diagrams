-- 44 more diagrams, to try the list of diagrams and its pages with: 45 in all,
-- which is three pages of 20.
-- Optional, and after 003_sample_diagram.sql: every diagram here shows the first
-- few of the 24 sample funds. The same funds are in many diagrams, and their
-- relationships come along by themselves. No fund has a position, so the app
-- arranges each diagram when it is opened.
begin;
  -- Spread over the past months, so that the two dates differ from row to row.
  insert into diagram (name, description, created_at, updated_at)
  select 'Fund structure ' || n,
         'The first ' || 3 + n % 22 || ' funds of the sample',
         now() - n * interval '3 days',
         now() - n * interval '5 hours'
  from generate_series(2, 45) n;

  insert into diagram_node (diagram_id, legal_entity_id)
  select d.id, e.id
  from diagram d
  join legal_entity e on e.id <= 3 + substring(d.name from '\d+$')::int % 22
  where d.name like 'Fund structure %';
commit;
