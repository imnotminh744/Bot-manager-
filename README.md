# Blox Fruit Manager

Quản lý đơn cày thuê Roblox và kho script Blox Fruit. Chạy hoàn toàn trên GitHub Pages.

Cấu trúc repo:

| File | Việc |
|---|---|
| `index.html` | Toàn bộ giao diện và logic |
| `firebase-config.js` | Cấu hình Firebase (để trống = chế độ lưu trên máy) |
| `firestore.rules` | Quy tắc bảo mật cho Firestore, dán vào Firebase Console |

## Hai chế độ

- **Chưa điền `firebase-config.js`**: không có đăng nhập, đơn hàng lưu trong trình duyệt của máy đang dùng.
- **Đã điền**: có màn hình đăng nhập / tạo tài khoản. Đơn hàng và key script lưu trên cloud theo tài khoản, đăng nhập ở máy nào cũng thấy cùng dữ liệu, cập nhật gần như tức thì giữa các máy.

## Bật đăng nhập và đồng bộ (làm một lần, khoảng 5 phút, miễn phí)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên bất kỳ (tắt Google Analytics cũng được).
2. Trong project: **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.
3. **Build → Firestore Database → Create database** → chọn vị trí (ví dụ `asia-southeast1`) → **Start in production mode**.
4. Trong Firestore, mở tab **Rules**, xóa nội dung cũ, dán toàn bộ nội dung file `firestore.rules` → **Publish**.
5. **Project settings (biểu tượng bánh răng) → General → Your apps → biểu tượng `</>` (Web)** → đặt tên app → Register. Firebase hiện ra đoạn `firebaseConfig`.
6. Copy 4 giá trị `apiKey`, `authDomain`, `projectId`, `appId` vào file `firebase-config.js`, commit lên GitHub.
7. Vào **Authentication → Settings → Authorized domains**, kiểm tra có `imnotminh744.github.io` (thường được thêm sẵn, nếu chưa thì Add domain).

Mở lại trang, sẽ thấy màn hình đăng nhập. Bấm **Tạo tài khoản** để tạo tài khoản đầu tiên.

## Ghi chú

- Tên tài khoản là chữ + số bình thường (vd `minh744`), không cần email. Bên trong web tự ghép thành `minh744@bot-manager.local` để dùng với Firebase, nên **không có chức năng quên mật khẩu**. Hãy nhớ mật khẩu. Nếu quên, bạn có thể đặt lại thủ công trong Firebase Console → Authentication → Users.
- Muốn chỉ mình bạn dùng: sau khi tạo xong tài khoản của bạn, vào **Authentication → Settings → User actions** và tắt **Enable create (sign-up)**. Khi đó người lạ không tạo thêm được tài khoản.
- Đơn cũ đang lưu trên trình duyệt của một máy sẽ được phát hiện sau khi đăng nhập, có nút **Nhập vào tài khoản** để đẩy lên cloud.
- Mật khẩu Roblox và mã 2FA của khách được lưu nguyên văn trong Firestore của bạn. Chỉ tài khoản của bạn đọc được (theo `firestore.rules`), nhưng hãy dùng mật khẩu mạnh cho tài khoản quản lý, và đừng chia sẻ quyền truy cập Firebase project.
- Gói miễn phí (Spark) của Firebase dư sức cho việc quản lý đơn kiểu này.
