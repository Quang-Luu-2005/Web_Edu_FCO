# Bugfix Requirements Document

## Introduction

Người dùng (bao gồm admin và giảng viên) không thể đăng nhập qua biểu mẫu đăng nhập tại `/users/login`. Biểu mẫu gửi lên trường có tên `username`, nhưng phần xử lý đăng nhập lại tra cứu tài khoản theo `email` (trường này không tồn tại trong dữ liệu gửi lên nên luôn rỗng). Hệ quả là tài khoản đúng không được tìm thấy, quá trình đăng nhập thất bại ngay cả khi nhập đúng thông tin, và người dùng bị chuyển nhầm sang trang nhập OTP kèm thông báo "Invalid account". Lỗi này chặn truy cập vào trang quản trị và toàn bộ luồng đăng nhập bằng tên đăng nhập/mật khẩu.

## Bug Analysis

### Current Behavior (Defect)

Khi gửi biểu mẫu đăng nhập, hệ thống tra cứu tài khoản dựa trên một trường rỗng nên không khớp được tài khoản hợp lệ, dẫn đến đăng nhập thất bại và điều hướng sai.

1.1 WHEN người dùng (admin, giảng viên hoặc học viên) gửi biểu mẫu đăng nhập với tên đăng nhập và mật khẩu hợp lệ THEN the system tra cứu tài khoản bằng một giá trị rỗng nên không tìm thấy tài khoản và không đăng nhập được

1.2 WHEN việc tra cứu không tìm thấy tài khoản nào khớp THEN the system hiển thị trang nhập OTP kèm thông báo "Invalid account" thay vì quay lại trang đăng nhập với thông báo lỗi rõ ràng

1.3 WHEN thông tin đăng nhập sai (sai mật khẩu hoặc tài khoản không tồn tại) THEN the system điều hướng tới trang OTP thay vì báo lỗi ngay trên trang đăng nhập

### Expected Behavior (Correct)

Hệ thống cần xác thực dựa trên đúng dữ liệu mà biểu mẫu gửi lên và điều hướng người dùng đến đúng nơi.

2.1 WHEN người dùng gửi biểu mẫu đăng nhập với tên đăng nhập và mật khẩu hợp lệ THEN the system SHALL xác thực dựa trên đúng thông tin được gửi lên và đăng nhập thành công

2.2 WHEN việc xác thực thất bại do tài khoản không tồn tại THEN the system SHALL quay lại trang đăng nhập kèm thông báo lỗi rõ ràng (không chuyển sang trang OTP)

2.3 WHEN thông tin đăng nhập sai (sai mật khẩu) THEN the system SHALL hiển thị thông báo lỗi trên trang đăng nhập và cho phép thử lại

2.4 WHEN người dùng admin hoặc giảng viên đăng nhập thành công THEN the system SHALL chuyển hướng tới `/admin/homepage` (đúng đích đến theo vai trò)

### Unchanged Behavior (Regression Prevention)

Các luồng đang hoạt động đúng phải được giữ nguyên.

3.1 WHEN học viên chưa xác thực (cần OTP) đăng nhập THEN the system SHALL CONTINUE TO chuyển hướng tới bước nhập OTP để xác thực

3.2 WHEN người dùng đăng nhập bằng Google THEN the system SHALL CONTINUE TO hoạt động như hiện tại

3.3 WHEN tài khoản đã bị khóa (status = false) đăng nhập THEN the system SHALL CONTINUE TO từ chối đăng nhập

3.4 WHEN người dùng đã đăng nhập truy cập lại trang đăng nhập THEN the system SHALL CONTINUE TO chuyển hướng họ ra khỏi trang đăng nhập theo đúng vai trò
