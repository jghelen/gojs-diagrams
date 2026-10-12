-- A diagram to look at: the app's "Sample fund structure", 24 funds and 26 relationships,
-- and four user-defined fields with a few values.
-- Optional. For a database that is still empty apart from the legal entity types:
-- it counts on the funds getting the ids 1 to 24 and the diagram the id 1.
begin;
  insert into legal_entity (name, legal_entity_type_id) values ('Meridian Global FoF', (select id from legal_entity_type where name='Fund of funds'));
  insert into legal_entity (name, legal_entity_type_id) values ('Meridian PE Feeder', (select id from legal_entity_type where name='Feeder fund'));
  insert into legal_entity (name, legal_entity_type_id) values ('Buyout Fund IV', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Buyout IV Co-Invest', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Buyout IV Parallel', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Growth Feeder', (select id from legal_entity_type where name='Feeder fund'));
  insert into legal_entity (name, legal_entity_type_id) values ('Growth Fund II', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Growth II Co-Invest', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Growth II Annex', (select id from legal_entity_type where name='Private equity'));
  insert into legal_entity (name, legal_entity_type_id) values ('Meridian Credit FoF', (select id from legal_entity_type where name='Fund of funds'));
  insert into legal_entity (name, legal_entity_type_id) values ('Direct Lending III', (select id from legal_entity_type where name='Private credit'));
  insert into legal_entity (name, legal_entity_type_id) values ('Senior Loan Sleeve', (select id from legal_entity_type where name='Private credit'));
  insert into legal_entity (name, legal_entity_type_id) values ('Structured Credit', (select id from legal_entity_type where name='Private credit'));
  insert into legal_entity (name, legal_entity_type_id) values ('CLO Equity Tranche', (select id from legal_entity_type where name='Private credit'));
  insert into legal_entity (name, legal_entity_type_id) values ('Mezzanine Fund II', (select id from legal_entity_type where name='Private credit'));
  insert into legal_entity (name, legal_entity_type_id) values ('Meridian Real Assets', (select id from legal_entity_type where name='Fund of funds'));
  insert into legal_entity (name, legal_entity_type_id) values ('Core Real Estate', (select id from legal_entity_type where name='Real estate'));
  insert into legal_entity (name, legal_entity_type_id) values ('Logistics Property', (select id from legal_entity_type where name='Real estate'));
  insert into legal_entity (name, legal_entity_type_id) values ('Office Portfolio', (select id from legal_entity_type where name='Real estate'));
  insert into legal_entity (name, legal_entity_type_id) values ('Infrastructure I', (select id from legal_entity_type where name='Infrastructure'));
  insert into legal_entity (name, legal_entity_type_id) values ('Renewable Energy', (select id from legal_entity_type where name='Infrastructure'));
  insert into legal_entity (name, legal_entity_type_id) values ('Toll Roads Vehicle', (select id from legal_entity_type where name='Infrastructure'));
  insert into legal_entity (name, legal_entity_type_id) values ('Venture Access', (select id from legal_entity_type where name='Venture capital'));
  insert into legal_entity (name, legal_entity_type_id) values ('Seed Fund III', (select id from legal_entity_type where name='Venture capital'));
  insert into diagram (name, layout_type, link_type) values ('Sample fund structure','top-bottom','avoid');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,1,'Rectangle','#f3f4f6',700.5,0,'Annual audit is due on 31 March.');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,2,'Rectangle','#f3f4f6',0,157.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,3,'Rectangle','#f3f4f6',0,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,4,'Rectangle','#f3f4f6',0,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,5,'Rectangle','#f3f4f6',0,630,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,6,'Rectangle','#f3f4f6',233.5,157.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,7,'Rectangle','#f3f4f6',233.5,315,'Capital call notice has been sent to investors.');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,8,'Rectangle','#f3f4f6',233.5,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,9,'Rectangle','#f3f4f6',233.5,630,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,10,'Rectangle','#f3f4f6',700.5,157.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,11,'Rectangle','#f3f4f6',467,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,12,'Rectangle','#f3f4f6',467,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,13,'Rectangle','#f3f4f6',700.5,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,14,'Rectangle','#f3f4f6',700.5,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,15,'Rectangle','#f3f4f6',934,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,16,'Rectangle','#f3f4f6',1401,157.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,17,'Rectangle','#f3f4f6',1167.5,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,18,'Rectangle','#f3f4f6',1167.5,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,19,'Rectangle','#f3f4f6',1167.5,630,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,20,'Rectangle','#f3f4f6',1401,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,21,'Rectangle','#f3f4f6',1401,472.5,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,22,'Rectangle','#f3f4f6',1401,630,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,23,'Rectangle','#f3f4f6',1634.5,315,'');
  insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values (1,24,'Rectangle','#f3f4f6',1634.5,472.5,'');
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (1,2,'hierarchy',64);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (2,3,'hierarchy',48.75);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (3,4,'hierarchy',35.5);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (3,5,'hierarchy',null);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (1,6,'hierarchy',55);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (6,7,'hierarchy',37.5);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (7,8,'hierarchy',12.33);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (7,9,'hierarchy',null);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (1,10,'hierarchy',100);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (10,11,'hierarchy',22.4);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (11,12,'hierarchy',51);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (10,13,'hierarchy',18);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (13,14,'hierarchy',40);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (10,15,'hierarchy',null);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (1,16,'hierarchy',80.25);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (16,17,'hierarchy',31);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (17,18,'hierarchy',45);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (17,19,'hierarchy',28.6);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (16,20,'hierarchy',27.5);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (20,21,'hierarchy',60);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (20,22,'hierarchy',null);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (16,23,'hierarchy',9.9);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (23,24,'hierarchy',33.3);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (10,3,'relation',8.5);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (16,11,'relation',null);
  insert into relationship (from_legal_entity_id,to_legal_entity_id,kind,ownership_percent) values (1,17,'relation',15.75);

  -- Four fields that users might define, one of each type.
  insert into user_defined_field (name, data_type, is_optional) values
    ('Jurisdiction', 'text', false),
    ('Inception date', 'date', true),
    ('Assets under management in EUR m', 'number', true),
    ('Regulated', 'boolean', true);

  -- Some funds have some of them; most funds have none.
  insert into legal_entity_field_value (legal_entity_id, user_defined_field_id, value_text)
    select e.id, f.id, v.value
    from (values ('Meridian Global FoF', 'Luxembourg'), ('Meridian PE Feeder', 'Ireland'),
                 ('Buyout Fund IV', 'Luxembourg'), ('Growth Fund II', 'Cayman Islands')) v(entity, value)
    join legal_entity e on e.name = v.entity
    join user_defined_field f on f.name = 'Jurisdiction';
  insert into legal_entity_field_value (legal_entity_id, user_defined_field_id, value_date)
    select e.id, f.id, v.value::date
    from (values ('Meridian Global FoF', '2014-03-01'), ('Buyout Fund IV', '2019-09-15')) v(entity, value)
    join legal_entity e on e.name = v.entity
    join user_defined_field f on f.name = 'Inception date';
  insert into legal_entity_field_value (legal_entity_id, user_defined_field_id, value_number)
    select e.id, f.id, v.value
    from (values ('Meridian Global FoF', 1850.5), ('Buyout Fund IV', 420)) v(entity, value)
    join legal_entity e on e.name = v.entity
    join user_defined_field f on f.name = 'Assets under management in EUR m';
  insert into legal_entity_field_value (legal_entity_id, user_defined_field_id, value_boolean)
    select e.id, f.id, true
    from legal_entity e, user_defined_field f
    where e.name = 'Meridian Global FoF' and f.name = 'Regulated';
  -- A fund that has a field without a value for it yet: allowed, because the field is optional.
  insert into legal_entity_field_value (legal_entity_id, user_defined_field_id)
    select e.id, f.id
    from legal_entity e, user_defined_field f
    where e.name = 'Growth Fund II' and f.name = 'Inception date';
commit;
