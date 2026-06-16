-- =====================================================================
--  DANH SÁCH GIÁO VIÊN (roster) — admin tạo GV chỉ bằng TÊN (chưa cần gmail),
--  sau này gắn tài khoản đăng nhập để GV tự quản lý lịch của mình.
--  Chạy 1 lần: Supabase -> SQL Editor -> New query -> dán -> Run. (An toàn chạy lại.)
-- =====================================================================

-- 1) profiles: thêm cột email (để admin gắn tài khoản theo email)
alter table public.profiles add column if not exists email text;

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

-- 2) Bảng teachers (roster) — full_name bắt buộc, user_id gắn sau (có thể null)
create table if not exists public.teachers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
-- mỗi tài khoản chỉ gắn với tối đa 1 giáo viên
create unique index if not exists teachers_user_uidx on public.teachers(user_id) where user_id is not null;

-- 3) schedules.teacher_id giờ trỏ vào teachers (không phải auth.users)
delete from public.schedules;  -- bảng đang trống sau khi xóa user; cho chắc chắn
alter table public.schedules drop constraint if exists schedules_teacher_id_fkey;
alter table public.schedules
  add constraint schedules_teacher_id_fkey
  foreign key (teacher_id) references public.teachers(id) on delete cascade;

-- 4) RLS cho teachers: ai cũng xem được; chỉ Admin thêm/sửa/xóa
drop policy if exists "teachers_select_all" on public.teachers;
drop policy if exists "teachers_admin_ins"  on public.teachers;
drop policy if exists "teachers_admin_upd"  on public.teachers;
drop policy if exists "teachers_admin_del"  on public.teachers;
create policy "teachers_select_all" on public.teachers for select to authenticated using (true);
create policy "teachers_admin_ins"  on public.teachers for insert to authenticated with check (public.is_admin());
create policy "teachers_admin_upd"  on public.teachers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "teachers_admin_del"  on public.teachers for delete to authenticated using (public.is_admin());

-- 5) RLS schedules: Admin toàn quyền; GV chỉ quản lý lịch của GV gắn với mình
drop policy if exists "schedules_insert_own"       on public.schedules;
drop policy if exists "schedules_update_own_admin" on public.schedules;
drop policy if exists "schedules_delete_own_admin" on public.schedules;

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
