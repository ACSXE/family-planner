-- Actividades con varios asistentes (formato actual), para las pruebas del aviso semanal
insert into activities (activity_id, name, description, date, start_time, end_time, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Análisis sangre Sergio y vacuna Pablo', '', '2026-11-17', '08:00', '08:15', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Revisión familiar', '', '2026-11-17', '12:00', '13:00', 2);
insert into activity_attendees values
  ('bbbbbbbb-0000-0000-0000-000000000001', 3), ('bbbbbbbb-0000-0000-0000-000000000001', 4),
  ('bbbbbbbb-0000-0000-0000-000000000002', 1), ('bbbbbbbb-0000-0000-0000-000000000002', 2),
  ('bbbbbbbb-0000-0000-0000-000000000002', 3), ('bbbbbbbb-0000-0000-0000-000000000002', 4);
insert into activity_companions values ('bbbbbbbb-0000-0000-0000-000000000001', 1);
