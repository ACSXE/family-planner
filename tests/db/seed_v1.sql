-- Datos de prueba con el formato de la migración 001 (antes de 002)
insert into public.activities (id, name, description, date, start_time, end_time, attendees, companion, created_by) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'Médico oftalmólogo', 'Doctor/Unidad: VALLEJO SAN JUAN', '2026-11-16', '10:15', '10:30', '{alberto}', '', '11111111-1111-1111-1111-111111111111'),
 ('aaaaaaaa-0000-0000-0000-000000000002', 'Dentista', '', '2026-11-17', '17:00', '18:00', '{sergio,pablo}', 'alberto,laura', '22222222-2222-2222-2222-222222222222'),
 ('aaaaaaaa-0000-0000-0000-000000000003', 'Piano', 'x', '2026-11-18', '18:00', '19:00', '{pablo,laura}', 'laura', '11111111-1111-1111-1111-111111111111');
