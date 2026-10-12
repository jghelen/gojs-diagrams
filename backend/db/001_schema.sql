-- The database of the fund-structure editor, for PostgreSQL 14 or newer.
--
-- Eight tables in two groups:
--
--   Facts, shared by all diagrams:   legal_entity_type, legal_entity, relationship,
--                                    user_defined_field, legal_entity_field_value
--   One diagram's own data:          diagram, diagram_node, diagram_artificial_link
--
-- A node of a diagram is a legal entity. A legal entity can be placed in many
-- diagrams or in none. A relationship between two legal entities is the same in
-- every diagram: wherever both are placed, it is drawn. A diagram can add
-- artificial links of its own, which are drawn dashed and exist nowhere else. What each table is for is told in DATABASE.md.

-- Keeps updated_at current without the application having to remember.
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Facts, shared by all diagrams ----------

-- The kinds of fund: "Private equity", "Feeder fund" and so on.
create table legal_entity_type (
  id   bigint generated always as identity primary key,
  name text not null unique check (btrim(name) <> '')
);

-- One fund, wherever it is drawn. Its id is also the key of its node in a diagram.
create table legal_entity (
  id                   bigint generated always as identity primary key,
  name                 text not null check (btrim(name) <> ''),
  legal_entity_type_id bigint not null references legal_entity_type (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- For users, once there are any.
  created_by           bigint,
  updated_by           bigint
);
create index legal_entity_type_idx on legal_entity (legal_entity_type_id);
create index legal_entity_name_idx on legal_entity (lower(name));

-- Relationships and artificial links take their ids from one counter. In a
-- diagram both are lines, and the id is the key of the line there: this way a
-- relationship and an artificial link never have the same key.
create sequence link_key_seq;

-- A fact: the "from" entity invests in the "to" entity, and owns that much of it.
-- It is not chosen per diagram: every diagram that has both entities shows it.
create table relationship (
  id                   bigint primary key default nextval('link_key_seq'),
  from_legal_entity_id bigint not null references legal_entity (id) on delete cascade,
  to_legal_entity_id   bigint not null references legal_entity (id) on delete cascade,
  -- 'hierarchy': the main holding, which makes the tree. 'relation': a co-investment.
  kind                 text not null check (kind in ('hierarchy', 'relation')),
  -- Null when it is not known.
  ownership_percent    numeric(5, 2) check (ownership_percent > 0 and ownership_percent <= 100),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           bigint,
  updated_by           bigint,
  check (from_legal_entity_id <> to_legal_entity_id)
);
-- One relationship per pair of entities, whichever way it points.
create unique index relationship_pair_idx on relationship
  (least(from_legal_entity_id, to_legal_entity_id), greatest(from_legal_entity_id, to_legal_entity_id));
-- A fund has at most one main holding into it.
create unique index relationship_one_parent_idx on relationship (to_legal_entity_id)
  where kind = 'hierarchy';
create index relationship_from_idx on relationship (from_legal_entity_id);

-- ---------- Fields that users define for legal entities ----------

-- A field somebody has defined, such as "Jurisdiction" or "Inception date".
create table user_defined_field (
  id          bigint generated always as identity primary key,
  name        text not null check (btrim(name) <> ''),
  -- What kind of value the field holds.
  data_type   text not null check (data_type in ('text', 'number', 'date', 'boolean')),
  -- An optional field may be left empty on an entity that has it; a required one may not.
  is_optional boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  bigint,
  updated_by  bigint
);
-- No two fields of the same name, however the name is capitalised.
create unique index user_defined_field_name_idx on user_defined_field (lower(btrim(name)));

-- A legal entity that has a field, and the value it has for it. No row: the entity
-- does not have that field. A row with all four value columns null: it has the
-- field, and the field is empty.
create table legal_entity_field_value (
  legal_entity_id       bigint not null references legal_entity (id) on delete cascade,
  user_defined_field_id bigint not null references user_defined_field (id) on delete cascade,
  -- The value is in the column that goes with the field's data_type; the others are null.
  value_text            text check (btrim(value_text) <> ''),
  value_number          numeric,
  value_date            date,
  value_boolean         boolean,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint,
  updated_by            bigint,
  primary key (legal_entity_id, user_defined_field_id),
  check (num_nonnulls(value_text, value_number, value_date, value_boolean) <= 1)
);
-- "Which entities have this field?"
create index legal_entity_field_value_field_idx on legal_entity_field_value (user_defined_field_id);

-- A value has to fit its field: it is of the field's type, and a required field is not empty.
create function check_field_value() returns trigger language plpgsql as $$
declare
  field user_defined_field;
begin
  -- "for share" makes a change of the field wait until this value is stored, and the other way round.
  select * into field from user_defined_field where id = new.user_defined_field_id for share;
  if (new.value_text is not null and field.data_type <> 'text')
    or (new.value_number is not null and field.data_type <> 'number')
    or (new.value_date is not null and field.data_type <> 'date')
    or (new.value_boolean is not null and field.data_type <> 'boolean')
  then
    raise exception 'The field "%" holds a value of type %.', field.name, field.data_type
      using errcode = 'check_violation';
  end if;
  if not field.is_optional
    and num_nonnulls(new.value_text, new.value_number, new.value_date, new.value_boolean) = 0
  then
    raise exception 'The field "%" is required and cannot be left empty.', field.name
      using errcode = 'not_null_violation';
  end if;
  return new;
end $$;
create trigger legal_entity_field_value_check before insert or update on legal_entity_field_value
  for each row execute function check_field_value();

-- A field cannot be changed into something the values it already has do not fit.
create function check_field_change() returns trigger language plpgsql as $$
begin
  if new.data_type <> old.data_type and exists (
    select 1 from legal_entity_field_value
    where user_defined_field_id = new.id
      and num_nonnulls(value_text, value_number, value_date, value_boolean) > 0
  ) then
    raise exception 'The type of the field "%" cannot be changed while entities have values for it.', old.name
      using errcode = 'check_violation';
  end if;
  if old.is_optional and not new.is_optional and exists (
    select 1 from legal_entity_field_value
    where user_defined_field_id = new.id
      and num_nonnulls(value_text, value_number, value_date, value_boolean) = 0
  ) then
    raise exception 'The field "%" cannot be made required while entities have it empty.', old.name
      using errcode = 'not_null_violation';
  end if;
  return new;
end $$;
create trigger user_defined_field_check before update on user_defined_field
  for each row execute function check_field_change();

-- ---------- One diagram's own data ----------

-- One diagram and its settings.
create table diagram (
  id             bigint generated always as identity primary key,
  name           text not null check (btrim(name) <> ''),
  description    text not null default '',
  layout_type    text not null default 'top-bottom'
                 check (layout_type in ('top-bottom', 'bottom-top', 'circle', 'layered', 'force', 'grid')),
  link_type      text not null default 'avoid'
                 check (link_type in ('avoid', 'orthogonal', 'straight', 'curved')),
  -- Whether "Expand all" is on.
  cards_expanded boolean not null default false,
  -- What the nodes show under their name: a built-in field of a legal entity
  -- (subtitle_field), or a field that users defined (subtitle_user_defined_field_id),
  -- or nothing, when both are null.
  subtitle_field text check (subtitle_field in ('legalEntityType')),
  subtitle_user_defined_field_id bigint references user_defined_field (id) on delete set null,
  check (subtitle_field is null or subtitle_user_defined_field_id is null),
  -- Goes up with every save, so that two people cannot overwrite each other unnoticed.
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint,
  updated_by     bigint
);

-- A legal entity placed in a diagram: at most once per diagram, in as many diagrams as wanted.
create table diagram_node (
  diagram_id      bigint not null references diagram (id) on delete cascade,
  -- An entity that is in a diagram cannot be deleted.
  legal_entity_id bigint not null references legal_entity (id) on delete restrict,
  shape           text not null default 'Rectangle'
                  check (shape in ('Rectangle', 'RoundedRectangle', 'Ellipse', 'Diamond', 'Capsule', 'RoundedTopRectangle')),
  color           text not null default '#f3f4f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- The top left corner. Both null: not placed yet, the layout is to place it.
  -- double precision gives back exactly the number it was given, which the app relies on.
  x               double precision,
  y               double precision,
  comment         text not null default '',
  primary key (diagram_id, legal_entity_id),
  check ((x is null) = (y is null))
);
-- "Which diagrams is this legal entity in?"
create index diagram_node_entity_idx on diagram_node (legal_entity_id);

-- A line that exists in one diagram only: the user drew it there between two
-- nodes. It is drawn dashed, has no percentage, and says nothing about the two
-- legal entities anywhere else. It is not a relationship.
create table diagram_artificial_link (
  id                   bigint primary key default nextval('link_key_seq'),
  diagram_id           bigint not null references diagram (id) on delete cascade,
  from_legal_entity_id bigint not null,
  to_legal_entity_id   bigint not null,
  check (from_legal_entity_id <> to_legal_entity_id),
  -- Both ends are nodes of this diagram; taking a node out takes its artificial links out.
  foreign key (diagram_id, from_legal_entity_id)
    references diagram_node (diagram_id, legal_entity_id) on delete cascade,
  foreign key (diagram_id, to_legal_entity_id)
    references diagram_node (diagram_id, legal_entity_id) on delete cascade
);
-- One artificial link per pair of nodes in a diagram.
create unique index diagram_artificial_link_pair_idx on diagram_artificial_link
  (diagram_id, least(from_legal_entity_id, to_legal_entity_id), greatest(from_legal_entity_id, to_legal_entity_id));
create index diagram_artificial_link_to_idx on diagram_artificial_link (diagram_id, to_legal_entity_id);

-- Two nodes are joined by one line at most. So two legal entities that have a
-- relationship cannot be given an artificial link as well, and when two entities
-- get a relationship, it takes the place of the artificial links drawn between
-- them. The two functions below see to that.

-- Makes "is there a relationship?" and "is there an artificial link?" wait for
-- each other when they are about the same two entities at the same moment.
create function lock_entity_pair(a bigint, b bigint) returns void language sql as $$
  select pg_advisory_xact_lock(hashtextextended(least(a, b) || ':' || greatest(a, b), 0));
$$;

create function check_artificial_link() returns trigger language plpgsql as $$
begin
  perform lock_entity_pair(new.from_legal_entity_id, new.to_legal_entity_id);
  if exists (
    select from relationship r
    where least(r.from_legal_entity_id, r.to_legal_entity_id)
            = least(new.from_legal_entity_id, new.to_legal_entity_id)
      and greatest(r.from_legal_entity_id, r.to_legal_entity_id)
            = greatest(new.from_legal_entity_id, new.to_legal_entity_id)
  ) then
    raise exception 'legal entities % and % have a relationship, so they cannot have an artificial link',
      new.from_legal_entity_id, new.to_legal_entity_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger diagram_artificial_link_check
  before insert or update of from_legal_entity_id, to_legal_entity_id on diagram_artificial_link
  for each row execute function check_artificial_link();

create function replace_artificial_links() returns trigger language plpgsql as $$
begin
  perform lock_entity_pair(new.from_legal_entity_id, new.to_legal_entity_id);
  delete from diagram_artificial_link a
  where least(a.from_legal_entity_id, a.to_legal_entity_id)
          = least(new.from_legal_entity_id, new.to_legal_entity_id)
    and greatest(a.from_legal_entity_id, a.to_legal_entity_id)
          = greatest(new.from_legal_entity_id, new.to_legal_entity_id);
  return null;
end $$;
create trigger relationship_replaces_artificial_links
  after insert or update of from_legal_entity_id, to_legal_entity_id on relationship
  for each row execute function replace_artificial_links();

create trigger legal_entity_updated before update on legal_entity
  for each row execute function set_updated_at();
create trigger relationship_updated before update on relationship
  for each row execute function set_updated_at();
create trigger diagram_updated before update on diagram
  for each row execute function set_updated_at();
create trigger user_defined_field_updated before update on user_defined_field
  for each row execute function set_updated_at();
create trigger legal_entity_field_value_updated before update on legal_entity_field_value
  for each row execute function set_updated_at();
