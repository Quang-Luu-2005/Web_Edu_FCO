# MansterClass

> Ứng dụng web học trực tuyến xây dựng bằng Node.js/Express, hỗ trợ khóa học, thanh toán, lớp học và lớp thực hành.

## Tổng quan

Repo hiện chứa mã nguồn backend và giao diện EJS của một hệ thống học trực tuyến. Dự án có các khu vực chính:

- khu public cho khách và người học
- khu quản trị cho admin/giảng viên
- dữ liệu mẫu dạng JSON để import vào MongoDB
- bộ test unit/integration cho các luồng quan trọng

## Tính năng chính

### 1. Khách và người học

- Xem trang chủ với các nhóm khóa học nổi bật, xem nhiều và mới nhất
- Tìm kiếm khóa học, lọc theo danh mục và chủ đề
- Đăng ký tài khoản, xác thực OTP qua email, đăng nhập và đăng xuất
- Xem chi tiết khóa học, mô tả nội dung, wishlist và tiến độ học
- Đánh giá khóa học, viết review, trả lời, reaction và report nội dung
- Quản lý hồ sơ cá nhân, cập nhật thông tin, avatar và mật khẩu
- Gửi yêu cầu xác minh để chuyển từ tài khoản `guest` sang học viên
- Xem danh sách khóa học đã mua và lịch sử thanh toán

### 2. Thanh toán và ghi danh

- Thanh toán khóa học qua **PayOS**
- Hỗ trợ khóa học giá cố định và khóa học ở chế độ liên hệ
- Hỗ trợ mã giảm giá
- Có luồng success, cancel, fail và webhook xác nhận thanh toán

### 3. Lớp học và lớp thực hành

- Xem danh sách lớp học đã tham gia
- Xem chi tiết từng lớp, tiến độ học và điểm danh theo buổi
- Xem danh sách lớp thực hành và theo dõi lớp
- Đăng ký từng buổi thực hành
- Nhận thông báo trạng thái duyệt đăng ký
- Xem bracket thi đấu/thực hành
- Thanh toán buổi thực hành khi cần

### 4. Admin và giảng viên

- Quản lý banner trang chủ
- Quản lý danh mục, chủ đề và khóa học
- Quản lý giảng viên, học viên và người dùng
- Gán role, thay đổi trạng thái tài khoản, xóa tài khoản
- Quản lý học viên theo khóa học
- Tạo và quản lý lớp học, thêm/xóa học viên, quản lý buổi học
- Tạo và quản lý lớp thực hành, duyệt/từ chối đăng ký, tạo bracket, điểm danh
- Duyệt yêu cầu xác minh học viên
- Xem và xử lý support ticket

### 5. Hỗ trợ hệ thống

- Ghi nhận support ticket từ giao diện lỗi
- Áp dụng rate limit cho các luồng đăng nhập/đăng ký, thanh toán và thao tác ghi dữ liệu

## Công nghệ sử dụng

### Backend

- Node.js
- Express
- MongoDB
- Mongoose

### Giao diện và render nội dung

- EJS
- express-ejs-layouts
- MarkdownIt
- sanitize-html
- Video.js

### Xác thực và phiên đăng nhập

- Passport
- passport-local
- express-session
- connect-mongodb-session
- bcryptjs

### Dịch vụ ngoài

- PayOS cho thanh toán
- Cloudinary cho upload media
- Nodemailer / Resend cho OTP email

### Kiểm thử

- Jest
- Supertest
- mongodb-memory-server

## Cấu trúc thư mục

```text
README.md
source/
├─ backend/
│  ├─ admin/        # router + view quản trị
│  ├─ config/       # cấu hình auth, mail, cloudinary, payment...
│  ├─ middlewares/  # session, route, error, rate limit...
│  ├─ models/       # schema mongoose
│  ├─ routers/      # route public, user, course, payment, classes, practice
│  ├─ services/     # business logic như payment, class status
│  ├─ tests/        # unit test + integration test
│  ├─ views/        # giao diện EJS phía người dùng
│  ├─ public/       # static assets
│  ├─ scripts/      # script import dữ liệu
│  ├─ app.js
│  ├─ createApp.js
│  └─ package.json
└─ database/        # dữ liệu mẫu JSON
```

## Cài đặt và chạy local

### 1. Chuẩn bị

Bạn cần:

- Node.js
- MongoDB có thể truy cập qua `MONGO_URI`

### 2. Cài dependency

```bash
cd source/backend
npm install
```

### 3. Tạo file môi trường

Tạo file `source/backend/.env` từ `source/backend/.env.example` và cấu hình tối thiểu:

- `MONGO_URI`
- `SESSION_SECRET`
- `APP_URL` hoặc `PUBLIC_APP_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- cấu hình mail (`SMTP_USER` / `SMTP_PASS` hoặc `RESEND_API_KEY`)

### 4. Import dữ liệu mẫu

Repo hiện có các file dữ liệu mẫu trong `source/database`:

- `admins.json`
- `coursecategories.json`
- `courses.json`
- `coursetopics.json`
- `facebookusers.json`
- `lecturers.json`
- `localusers.json`
- `topweeks.json`

Có thể kiểm tra trước khi import:

```bash
npm run import:database:dry
```

Import dữ liệu:

```bash
npm run import:database
```

### 5. Chạy ứng dụng

```bash
npm start
```

Mặc định app chạy tại:

- `http://localhost:8000`

## Scripts có sẵn

| Script | Mô tả |
| --- | --- |
| `npm start` | Chạy ứng dụng |
| `npm test` | Chạy toàn bộ test |
| `npm run test:watch` | Chạy test ở chế độ watch |
| `npm run test:coverage` | Chạy test kèm coverage |
| `npm run import:database` | Import dữ liệu mẫu vào MongoDB |
| `npm run import:database:dry` | Kiểm tra import mà không ghi dữ liệu |

## Phạm vi test hiện có

Các test trong repo hiện bao phủ những khu vực chính như:

- đăng ký, OTP và đăng nhập
- cập nhật hồ sơ người dùng
- payment route và payment service
- practice payment
- support route
- rate limit middleware
- auth/public app URL/practice config
- logic trạng thái lớp học

## Ghi chú

- Luồng thanh toán hiện tại trong route người dùng đang dùng **PayOS**.
- Repo vẫn còn phần cấu hình **PayPal** mang tính legacy, nhưng checkout hiện tại không đi qua PayPal route riêng.
- Các tính năng gửi mail, thanh toán và upload media cần cấu hình dịch vụ ngoài đầy đủ trước khi chạy thực tế.
- `PUBLIC_APP_URL` hoặc `APP_URL` cần đúng để callback thanh toán hoạt động ổn định.
