# Hướng dẫn Upload ảnh lên ImgBB và gắn link vào code

## Bước 1 — Lấy API key ImgBB

1. Đăng ký / đăng nhập tại https://imgbb.com
2. Vào https://api.imgbb.com → lấy **API key**
3. Thêm vào file `.env`:
   ```
   IMGBB_API_KEY=your_imgbb_api_key_here
   ```

---

## Bước 2 — Danh sách ảnh cần upload

Upload từng ảnh dưới đây lên ImgBB, sau đó điền link vào cột **ImgBB URL**.

### 2.1 — Ảnh dùng chung (Static Assets)

| Tên hiển thị       | File gốc                                      | Dùng ở đâu                          | ImgBB URL |
|--------------------|-----------------------------------------------|--------------------------------------|-----------|
| Logo               | `source/backend/public/logo.png`              | Navbar, favicon toàn site            | https://i.ibb.co/69L9ymq/image-removebg-preview.png |
| PayPal icon        | `source/backend/public/paypal.png`            | Trang checkout                       | https://i.ibb.co/zVY9852q/paypal.jpg |
| Feature: Price     | `source/backend/public/images/features/price.svg`  | Trang giới thiệu tính năng      | https://i.ibb.co/qL5p8gYy/feature-price.jpg |
| Feature: Quality   | `source/backend/public/images/features/quality.svg` | Trang giới thiệu tính năng     | https://i.ibb.co/kVNLfk2L/feature-quality.jpg |
| Feature: Video     | `source/backend/public/images/features/video.svg`  | Trang giới thiệu tính năng      | https://i.ibb.co/r2BdKGGR/feature-video.jpg |

### 2.2 — Avatar mặc định

| Tên hiển thị       | File gốc                                                    | Dùng ở đâu                                      | ImgBB URL |
|--------------------|-------------------------------------------------------------|--------------------------------------------------|-----------|
| Default Avatar     | `source/backend/admin/public/avatar/default/avatar.png`    | Default cho User, Lecturer, Admin, Category, Topic | https://i.ibb.co/NnbNMtSw/default-avatar.png |
| Default Poster     | `source/backend/admin/public/poster/default/poster.png`    | Default cho Course poster                        | https://i.ibb.co/wr2CLVVd/default-poster.png |

### 2.3 — Poster khóa học

| Tên khóa học              | File gốc                                                          | ImgBB URL |
|---------------------------|-------------------------------------------------------------------|-----------|
| Graphing Python           | `source/backend/admin/public/poster/graphPython/poster.png`      | https://i.ibb.co/wr2CLVVd/default-poster.png _(trùng default)_ |
| Android Development       | `source/backend/admin/public/poster/beginerAdrDev/poster.png`    | https://i.ibb.co/b5DgrJNK/poster-beginer-Adr-Dev.jpg |
| Javascript Development    | `source/backend/admin/public/poster/beginerJvsDev/poster.png`    | https://i.ibb.co/sd2QH5Z4/poster-beginer-Jvs-Dev.jpg |
| Web Development           | `source/backend/admin/public/poster/beginerWebDev/poster.png`    | https://i.ibb.co/RGnjBTmq/poster-beginer-Web-Dev.jpg |
| Unity Game Dev            | `source/backend/admin/public/poster/gameDevUnity/poster.png`     | https://i.ibb.co/xqQ6MTLg/poster-game-Dev-Unity.webp |
| Communication Tutorial    | `source/backend/admin/public/poster/tutCommunication/poster.png` | https://i.ibb.co/W4NrBGVt/poster-tut-Communication.jpg |
| Photoshop Tutorial        | `source/backend/admin/public/poster/tutPhotoshop/poster.png`     | https://i.ibb.co/v4y7YD8z/poster-tut-Photoshop.jpg |

### 2.4 — Ảnh banner trang chủ (public/image/)

> Đây là 26 ảnh số (1.jpg → 26.jpg) trong `source/backend/public/image/`.
> Upload tất cả lên ImgBB rồi điền link vào `config/home-banners.json`.

| File       | ImgBB URL |
|------------|-----------|
| 1.jpg      | _(điền sau)_ |
| 2.jpg      | _(điền sau)_ |
| 3.jpg      | _(điền sau)_ |
| 4.jpg      | _(điền sau)_ |
| 5.jpg      | _(điền sau)_ |
| 6.jpg      | _(điền sau)_ |
| 7.jpg      | _(điền sau)_ |
| 8.jpg      | _(điền sau)_ |
| 9.jpg      | _(điền sau)_ |
| 10.jpg     | _(điền sau)_ |
| 11.jpg     | _(điền sau)_ |
| 12.jpg     | _(điền sau)_ |
| 13.jpg     | _(điền sau)_ |
| 14.jpg     | _(điền sau)_ |
| 15.jpg     | _(điền sau)_ |
| 16.jpg     | _(điền sau)_ |
| 17.jpg     | _(điền sau)_ |
| 18.jpg     | _(điền sau)_ |
| 19.jpg     | _(điền sau)_ |
| 21.webp    | _(điền sau)_ |
| 22.jpg     | _(điền sau)_ |
| 23.jpg     | _(điền sau)_ |
| 24.jfif    | _(điền sau)_ |
| 25.jpg     | _(điền sau)_ |
| 26.jpg     | _(điền sau)_ |

---

## Bước 3 — Gắn link vào code

Sau khi upload xong, thay thế từng link theo hướng dẫn dưới đây.

### 3.1 — Logo & PayPal icon

**File:** `source/backend/views/partials/toolbar.ejs`
```html
<!-- Thay dòng này -->
<img src="/public/logo.png" ... />
<!-- Thành -->
<img src="IMGBB_URL_LOGO" ... />
```

**File:** `source/backend/views/layout.ejs`
```html
<!-- Thay dòng này -->
<link rel="shortcut icon" href="/public/logo.png" />
<!-- Thành -->
<link rel="shortcut icon" href="IMGBB_URL_LOGO" />
```

**File:** `source/backend/admin/views/index/home.ejs`
```html
<link rel="shortcut icon" href="IMGBB_URL_LOGO" />
```

**File:** `source/backend/views/payment/checkout.ejs`
```html
<!-- Thay -->
<img src="/public/paypal.png" ... />
<!-- Thành -->
<img src="IMGBB_URL_PAYPAL" ... />
```

---

### 3.2 — Default Avatar & Default Poster (Models)

Thay trong **tất cả 7 model files** dưới đây:

| File | Thay |
|------|------|
| `source/backend/models/Lecturer.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/models/CourseCategory.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/models/CourseTopic.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/models/Course.model.js` | `/public/poster/default/poster.png` → `IMGBB_URL_DEFAULT_POSTER` |
| `source/backend/admin/models/Admin.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/admin/models/Lecturer.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/admin/models/LocalUser.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/admin/models/CourseCategory.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/admin/models/CourseTopic.model.js` | `/public/avatar/default/avatar.png` → `IMGBB_URL_DEFAULT_AVATAR` |
| `source/backend/admin/models/Course.model.js` | `/public/poster/default/poster.png` → `IMGBB_URL_DEFAULT_POSTER` |

Cũng thay trong:

**File:** `source/backend/routers/course.route.js`
```js
// Thay
avatar: '/public/avatar/default/avatar.png'
// Thành
avatar: 'IMGBB_URL_DEFAULT_AVATAR'
```

**File:** `source/backend/config/passport.config.js`
```js
// Thay
const DEFAULT_AVATAR = 'https://res.cloudinary.com/teamwebctt2/...'
// Thành
const DEFAULT_AVATAR = 'IMGBB_URL_DEFAULT_AVATAR';
```

---

### 3.3 — Poster khóa học (tempCode.js / seed data)

**File:** `source/backend/tempCode.js`

Thay từng dòng poster:
```js
poster: '/public/poster/graphPython/poster.png'       → 'IMGBB_URL_POSTER_GRAPHPYTHON'
poster: '/public/poster/beginerAdrDev/poster.png'     → 'IMGBB_URL_POSTER_ADRDEV'
poster: '/public/poster/beginerJvsDev/poster.png'     → 'IMGBB_URL_POSTER_JVSDEV'
poster: '/public/poster/beginerWebDev/poster.png'     → 'IMGBB_URL_POSTER_WEBDEV'
poster: '/public/poster/gameDevUnity/poster.png'      → 'IMGBB_URL_POSTER_UNITY'
poster: '/public/poster/tutCommunication/poster.png'  → 'IMGBB_URL_POSTER_COMMUNICATION'
poster: '/public/poster/tutPhotoshop/poster.png'      → 'IMGBB_URL_POSTER_PHOTOSHOP'
```

---

### 3.4 — Banner trang chủ

**File:** `source/backend/config/home-banners.json`

Sau khi upload 3 ảnh banner muốn dùng, sửa file thành:
```json
[
  "IMGBB_URL_BANNER_1",
  "IMGBB_URL_BANNER_2",
  "IMGBB_URL_BANNER_3"
]
```

---

## Bước 4 — Thêm vào .gitignore

Các thư mục ảnh user-generated (avatar upload của user) không cần push lên GitHub.
Thêm vào `source/backend/.gitignore`:

```
# User uploaded images (generated at runtime)
public/avatar/*/
admin/public/avatar/*/
admin/public/poster/*/
admin/public/image/category/*/
admin/public/image/lecturer/*/

# Static assets đã được host trên ImgBB
public/image/
public/images/
public/logo.png
public/paypal.png
admin/public/logo.png
admin/public/avatar/default/
admin/public/poster/default/
admin/public/image/
```

---

## Lưu ý

- Ảnh avatar do user upload lúc runtime (trong `public/avatar/<userId>/`) **không cần** lên ImgBB — chúng được tạo ra khi user dùng app. Nếu muốn persist, nên chuyển upload avatar sang Cloudinary (đã có sẵn config).
- Ảnh trong `public/image/1.jpg ... 26.jpg` trông như ảnh demo/seed data — chỉ upload những ảnh thực sự dùng làm banner.
- ImgBB free tier giới hạn 32MB/ảnh, phù hợp cho static assets.
