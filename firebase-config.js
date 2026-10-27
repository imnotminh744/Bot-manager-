/*
  Cấu hình Firebase cho Blox Fruit Manager.
  - Để TRỐNG như dưới đây  -> web chạy chế độ lưu trên máy (không có đăng nhập).
  - Điền đủ apiKey + projectId -> bật đăng nhập và đồng bộ dữ liệu giữa các máy.
  Hướng dẫn lấy các giá trị này nằm trong README.md.
  (apiKey của Firebase web KHÔNG phải bí mật, an toàn để public; dữ liệu được bảo vệ bằng firestore.rules.)
*/
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};
