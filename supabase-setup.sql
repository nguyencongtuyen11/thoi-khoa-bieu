-- =====================================================================
--  THIẾT LẬP CƠ SỞ DỮ LIỆU SUPABASE  cho web Quản lý lịch học / TKB
--  (Cài MỚI hoàn toàn. Đã có DB cũ thì chạy các file migration thay vì file này.)
--  Dùng: Supabase Dashboard -> SQL Editor -> New query -> dán -> Run.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) PROFILES — tài khoản đăng nhập + vai trò (teacher/admin)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text,
  role       text not null default 'teacher',  -- 'teacher' hoặc 'admin'
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
--  2) TEACHERS — danh sách giáo viên (roster). Admin tạo bằng TÊN,
--     user_id gắn sau (null = chưa có tài khoản đăng nhập)
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
create unique index if not exists teachers_user_uidx on public.teachers(user_id) where user_id is not null;

-- ---------------------------------------------------------------------
--  3) SCHEDULES — lịch học theo ngày, gắn vào teachers (roster)
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  schedule_date date not null,
  subject       text not null,
  class_name    text,
  start_time    time not null,
  end_time      time not null,
  room          text,
  teacher_name  text,                          -- tên GV (denormalized, để hiển thị)
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint time_order_valid check (end_time > start_time)
);
alter table public.schedules enable row level security;
create index if not exists schedules_teacher_idx on public.schedules (teacher_id);
create index if not exists schedules_date_idx    on public.schedules (schedule_date, start_time);

-- ---------------------------------------------------------------------
--  4) HÀM & TRIGGER
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'teacher'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute procedure public.touch_updated_at();

-- =====================================================================
--  5) RLS
-- =====================================================================

-- ---- PROFILES ----
drop policy if exists "profiles_select_all"  on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_select_all"  on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());

-- ---- TEACHERS ---- (ai cũng xem; chỉ Admin thêm/sửa/xóa)
drop policy if exists "teachers_select_all" on public.teachers;
drop policy if exists "teachers_admin_ins"  on public.teachers;
drop policy if exists "teachers_admin_upd"  on public.teachers;
drop policy if exists "teachers_admin_del"  on public.teachers;
create policy "teachers_select_all" on public.teachers for select to authenticated using (true);
create policy "teachers_admin_ins"  on public.teachers for insert to authenticated with check (public.is_admin());
create policy "teachers_admin_upd"  on public.teachers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "teachers_admin_del"  on public.teachers for delete to authenticated using (public.is_admin());

-- ---- SCHEDULES ---- (ai cũng xem; Admin toàn quyền; GV quản lý lịch của GV gắn với mình)
drop policy if exists "schedules_select_all"       on public.schedules;
drop policy if exists "schedules_insert_own"       on public.schedules;
drop policy if exists "schedules_update_own_admin" on public.schedules;
drop policy if exists "schedules_delete_own_admin" on public.schedules;

create policy "schedules_select_all" on public.schedules for select to authenticated using (true);

create policy "schedules_insert_own" on public.schedules for insert to authenticated
  with check ( public.is_admin() or exists (
    select 1 from public.teachers t where t.id = teacher_id and t.user_id = auth.uid()) );

create policy "schedules_update_own_admin" on public.schedules for update to authenticated
  using ( public.is_admin() or exists (
    select 1 from public.teachers t where t.id = teacher_id and t.user_id = auth.uid()) )
  with check ( public.is_admin() or exists (
    select 1 from public.teachers t where t.id = teacher_id and t.user_id = auth.uid()) );

create policy "schedules_delete_own_admin" on public.schedules for delete to authenticated
  using ( public.is_admin() or exists (
    select 1 from public.teachers t where t.id = teacher_id and t.user_id = auth.uid()) );

-- =====================================================================
--  6) PHONG ADMIN: sau khi tài khoản đã ĐĂNG KÝ, chạy (đổi email):
--     update public.profiles set role='admin'
--     where id = (select id from auth.users where email='admin@example.com');
-- =====================================================================
