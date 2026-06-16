# 📅 Thời khóa biểu Giáo viên (Supabase)

Web cho **đội ngũ giáo viên** tự đăng nhập, **thêm / sửa / xóa** lịch học,
xem **thời khóa biểu cả tuần** (Thứ 2 → Chủ nhật × buổi Sáng – Chiều – Tối). Dữ liệu lưu trên **Supabase**.

- ✅ Đăng nhập / Đăng ký + **Quên mật khẩu / Đặt lại mật khẩu qua email**
- ✅ **Lưới cả tuần** trên laptop · tự chuyển **danh sách theo ngày** trên điện thoại
- ✅ Buổi **Sáng / Chiều / Tối** tự suy ra từ giờ bắt đầu · điều hướng **tuần / tháng**, nút **Tuần này**, chọn ngày nhanh
- ✅ Mỗi giáo viên quản lý lịch của **mình**; **Admin** sửa/xóa được **tất cả**
- ✅ Lọc theo từng giáo viên · Giao diện **tối/sáng** · Tối ưu **điện thoại & laptop**
- ✅ Bảo mật bằng Row Level Security (RLS) ngay trong database

---

## 🚀 Cài đặt

### A) Nếu bạn ĐÃ chạy `supabase-setup.sql` bản cũ (mô hình "theo thứ")
Chỉ cần chạy **migration** để chuyển sang mô hình "theo ngày":
1. Supabase → **SQL Editor** → **New query**
2. Dán toàn bộ [`supabase-migration.sql`](supabase-migration.sql) → **Run**

### B) Nếu cài MỚI hoàn toàn
1. Tạo project tại https://supabase.com
2. **SQL Editor** → dán toàn bộ [`supabase-setup.sql`](supabase-setup.sql) → **Run**
3. Mở [`config.js`](config.js), điền `SUPABASE_URL` (Project URL gốc, **không** kèm `/rest/v1/`) và `SUPABASE_ANON_KEY`
   *(lấy ở **Project Settings → Data API**)*

### Chạy web
- Nhanh: nháy đúp `index.html`.
- Khuyến nghị (để Auth ổn định): chạy server tĩnh rồi mở http://localhost:5500
  ```powershell
  python -m http.server 5500
  ```
  Hoặc VS Code + **Live Server**.

---

## 👤 Tạo Admin
Mọi người đăng ký đều là **giáo viên**. Để cấp quyền Admin, sau khi tài khoản đã đăng ký, chạy (đổi email):
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

---

## 🔑 Quên mật khẩu qua email — lưu ý cấu hình
Tính năng "Quên mật khẩu" gửi **email chứa liên kết đặt lại**. Để liên kết mở đúng trang web:

- Vào Supabase → **Authentication → URL Configuration**
  - **Site URL**: đặt thành địa chỉ web của bạn (vd `https://tkb-truong.vercel.app`, hoặc `http://localhost:5500` khi chạy nội bộ)
  - **Redirect URLs**: thêm địa chỉ đó (vd `http://localhost:5500/**`)
- (Tùy chọn) Vào **Authentication → Emails** để Việt hóa nội dung email.

> Trên `localhost`, app dùng Site URL mặc định của Supabase nên hãy đặt Site URL = `http://localhost:5500` để bấm liên kết trong email mở lại đúng app.

---

## 🗂️ File trong dự án
| File | Vai trò |
|------|---------|
| `index.html` | Cấu trúc trang (auth + bảng TKB + modal) |
| `styles.css` | Giao diện (theme tối/sáng, glass, responsive) |
| `app.js` | Logic: auth, điều hướng ngày, tải lịch, thêm/sửa/xóa |
| `config.js` | **Bạn điền** URL + anon key Supabase |
| `supabase-setup.sql` | SQL cài MỚI (đầy đủ bảng + RLS) |
| `supabase-migration.sql` | Nâng cấp từ bản cũ sang mô hình theo ngày |
| `supabase-teachers.sql` | Nâng cấp thêm bảng danh sách giáo viên (roster) |

---

## 🧱 Mô hình dữ liệu
**profiles** — tài khoản đăng nhập: `id`, `full_name`, `email`, `role` (`teacher` / `admin`)

**teachers** — danh sách giáo viên (roster): `id`, `full_name`, `user_id` (tài khoản gắn với GV, có thể null).
Admin tạo GV chỉ bằng **tên**; khi GV đăng ký thì gắn tài khoản (qua nút **👥 Giáo viên**) để họ tự quản lý lịch.

**schedules** — lịch học: `id`, `teacher_id` → `teachers.id`, `schedule_date` (ngày), `subject`, `class_name`,
`start_time`, `end_time`, `room`, `teacher_name`, `note`.

> Buổi **Sáng/Chiều/Tối** tự suy ra từ `start_time` (< 12h = Sáng, 12–18h = Chiều, ≥ 18h = Tối).
> Chỉ đặt được lịch cho **hôm nay trở đi** (không đặt lịch ngày quá khứ).

### Quyền (RLS)
| Hành động | Giáo viên | Admin |
|-----------|-----------|-------|
| Xem toàn bộ lịch | ✅ | ✅ |
| Thêm lịch (cho mình) | ✅ | ✅ |
| Sửa/Xóa lịch của mình | ✅ | ✅ |
| Sửa/Xóa lịch người khác | ❌ | ✅ |

---

## ☁️ Đưa lên mạng
Web tĩnh, deploy dễ: kéo-thả thư mục lên **Netlify** (https://app.netlify.com/drop), **Vercel**, hoặc **Cloudflare Pages**.
Nhớ cập nhật **Site URL / Redirect URLs** trong Supabase theo tên miền mới (mục Quên mật khẩu ở trên).
