-- =====================================================================
--  MIGRATION — chuyển thời khóa biểu sang mô hình "theo NGÀY cụ thể"
-- =====================================================================
--  Chạy 1 lần trong Supabase: SQL Editor -> New query -> dán -> Run.
--  An toàn để chạy lại nhiều lần (idempotent).
--  (Nếu bạn cài MỚI hoàn toàn thì dùng supabase-setup.sql là đủ, không cần file này.)
-- =====================================================================

-- 1) Thêm cột mới
alter table public.schedules add column if not exists schedule_date date;
alter table public.schedules add column if not exists teacher_name  text;  -- GV phụ trách (hiển thị)

-- 2) Bỏ mô hình cũ "day_of_week"
alter table public.schedules drop constraint if exists day_of_week_valid;
alter table public.schedules drop column     if exists day_of_week;

-- 3) Dữ liệu cũ (nếu có) chưa có ngày -> tạm gán hôm nay, rồi đặt NOT NULL
update public.schedules set schedule_date = current_date where schedule_date is null;
alter table public.schedules alter column schedule_date set not null;

-- 4) Chỉ mục giúp truy vấn theo ngày nhanh
drop index if exists schedules_day_idx;
create index if not exists schedules_date_idx on public.schedules (schedule_date, start_time);

-- 5) Cho phép ADMIN thêm lịch hộ cho BẤT KỲ giáo viên nào
--    (giáo viên thường vẫn chỉ thêm được lịch cho chính mình)
drop policy if exists "schedules_insert_own" on public.schedules;
create policy "schedules_insert_own"
  on public.schedules for insert
  to authenticated
  with check (teacher_id = auth.uid() or public.is_admin());
