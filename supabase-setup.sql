-- =====================================================================
--  THIẾT LẬP CƠ SỞ DỮ LIỆU SUPABASE  cho web Quản lý lịch học / TKB
-- =====================================================================
--  Cách dùng:
--    1. Vào Supabase Dashboard -> chọn project -> SQL Editor
--    2. Bấm "New query", dán TOÀN BỘ file này vào, bấm "Run"
--    3. Chạy 1 lần là xong. Chạy lại nhiều lần cũng an toàn (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) BẢNG PROFILES  (hồ sơ giáo viên, gắn với tài khoản đăng nhập)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       text not null default 'teacher',  -- 'teacher' hoặc 'admin'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
--  2) BẢNG SCHEDULES  (lịch học / thời khóa biểu theo tuần)
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references auth.users (id) on delete cascade,
  schedule_date date not null,                 -- ngày học cụ thể
  subject       text not null,                 -- môn học
  class_name    text,                          -- lớp
  start_time    time not null,
  end_time      time not null,
  room          text,                          -- phòng học
  teacher_name  text,                          -- GV phụ trách (hiển thị; mặc định theo người tạo)
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint time_order_valid check (end_time > start_time)
);

alter table public.schedules enable row level security;

create index if not exists schedules_teacher_idx on public.schedules (teacher_id);
create index if not exists schedules_date_idx    on public.schedules (schedule_date, start_time);

-- ---------------------------------------------------------------------
--  3) HÀM TIỆN ÍCH  is_admin()  — kiểm tra user hiện tại có phải admin
--     SECURITY DEFINER để không bị đệ quy RLS khi đọc bảng profiles.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
--  4) TỰ ĐỘNG TẠO PROFILE khi có người đăng ký mới
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'teacher'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
--  5) TỰ ĐỘNG cập nhật updated_at mỗi khi sửa lịch
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute procedure public.touch_updated_at();

-- =====================================================================
--  6) CHÍNH SÁCH RLS  (Row Level Security)
-- =====================================================================

-- ---- PROFILES ----
drop policy if exists "profiles_select_all"    on public.profiles;
drop policy if exists "profiles_update_self"   on public.profiles;
drop policy if exists "profiles_insert_self"   on public.profiles;

-- Mọi người đã đăng nhập đều xem được hồ sơ (để hiển thị tên giáo viên)
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

-- Mỗi người tự sửa hồ sơ của mình (đổi tên hiển thị)
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Cho phép tự tạo hồ sơ (phòng khi trigger ở trên chưa kịp tạo)
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ---- SCHEDULES ----
drop policy if exists "schedules_select_all"      on public.schedules;
drop policy if exists "schedules_insert_own"      on public.schedules;
drop policy if exists "schedules_update_own_admin" on public.schedules;
drop policy if exists "schedules_delete_own_admin" on public.schedules;

-- Cả đội đều xem được toàn bộ thời khóa biểu
create policy "schedules_select_all"
  on public.schedules for select
  to authenticated
  using (true);

-- Giáo viên chỉ thêm lịch cho chính mình; Admin thêm hộ cho bất kỳ giáo viên nào
create policy "schedules_insert_own"
  on public.schedules for insert
  to authenticated
  with check (teacher_id = auth.uid() or public.is_admin());

-- Sửa: chủ lịch hoặc admin
create policy "schedules_update_own_admin"
  on public.schedules for update
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

-- Xóa: chủ lịch hoặc admin
create policy "schedules_delete_own_admin"
  on public.schedules for delete
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

-- =====================================================================
--  7) PHONG MỘT NGƯỜI LÀM ADMIN
-- =====================================================================
--  Sau khi tài khoản đó đã ĐĂNG KÝ xong, chạy lệnh dưới (đổi email lại):
--
--    update public.profiles
--    set role = 'admin'
--    where id = (select id from auth.users where email = 'admin@example.com');
--
-- =====================================================================
