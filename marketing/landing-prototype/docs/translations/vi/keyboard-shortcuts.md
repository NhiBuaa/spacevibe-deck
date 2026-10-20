---
translated-from: 96599ebe
---

# Phím tắt

Mỗi phím tắt là một thao tác có tên riêng, và trong Settings → Shortcuts bạn có thể gán phím khác
cho bất kỳ thao tác nào. Các bảng dưới đây là phím mặc định khi cài Deck.

Trên macOS, **⌘C** và **⌘V** đơn thuần vẫn là Copy và Paste của hệ thống. Trên Windows, các tổ hợp
**Ctrl+** đơn thuần được để lại cho shell và agent, trừ hai trường hợp: **Ctrl+V** để dán, còn
**Ctrl+C** sẽ sao chép khi terminal đang có vùng chọn, không thì vẫn ngắt chương trình đang chạy như
bình thường.

## Mở và di chuyển

| Thao tác                         | macOS     | Windows                   |
| -------------------------------- | --------- | ------------------------- |
| Chạy một agent                   | ⌘T        | Ctrl+Shift+T              |
| Nhảy tới pane đang cần bạn       | ⌘⇧A       | Ctrl+Shift+A              |
| Mission Control                  | ⌘⇧O       | Ctrl+Shift+O              |
| Space hoặc chip kế tiếp / trước  | ⌘⇧] / ⌘⇧[ | Ctrl+Tab / Ctrl+Shift+Tab |
| Chọn space hoặc chip 1–8         | ⌘1 … ⌘8   | Ctrl+1 … Ctrl+8           |
| Chọn chip cuối cùng              | ⌘9        | Ctrl+9                    |
| Mở lại tab vừa đóng              | ⌘⇧T       | Ctrl+Alt+Shift+T          |

Mỗi tab terminal là một space, hiện trên dải tab thành một dấu nhỏ sau project, branch, space và
phiên hiện tại. Dải này chỉ hiện các space của project đang mở; muốn sang project khác thì đi từ
Agent Rail. Các con số đếm những space đó trước, rồi tới tài liệu đang mở và tab trình duyệt. Vuốt
ngang hai ngón trên vùng terminal cũng chuyển sang space bên cạnh.

⌘⇧O mở Mission Control. Rê chuột lên một space ở phía trên để xem các pane của nó, bấm vào một
pane để tới thẳng đó, hoặc bấm Esc để quay lại mà không đổi gì. Trong lúc nó mở, không có gì bị
dừng hay khởi động lại.

## Pane

| Thao tác                             | macOS          | Windows                 |
| ------------------------------------ | -------------- | ----------------------- |
| Chia cạnh nhau                       | ⌘D             | Ctrl+Shift+D            |
| Chia chồng lên nhau                  | ⌘⇧D            | Ctrl+Alt+Shift+D        |
| Đóng pane                            | ⌘W             | Ctrl+Shift+W            |
| Đóng tab                             | ⌘⇧W            | Ctrl+Alt+Shift+W        |
| Chuyển sang pane kế tiếp / trước     | ⌘] / ⌘[        | Ctrl+Alt+] / Ctrl+Alt+[ |
| Chuyển sang pane trái / phải / trên / dưới | ⌘⌥ + mũi tên | Ctrl+Alt+mũi tên  |
| Đổi chỗ với pane bên cạnh            | ⌘⌥⇧ + mũi tên  | Ctrl+Alt+Shift+mũi tên  |
| Mở rộng pane đang chọn               | ⌘E             | Ctrl+Shift+E            |
| Phóng to pane phủ cả tab             | ⌘⇧Enter        | Ctrl+Shift+Enter        |
| Tách pane ra cửa sổ mới              | ⌘⇧M            | Ctrl+Shift+M            |

## Terminal

| Thao tác                         | macOS               | Windows                                   |
| -------------------------------- | ------------------- | ----------------------------------------- |
| Tìm trong scrollback             | ⌘F                  | Ctrl+Shift+F                              |
| Kết quả tiếp theo / trước        | ⌘G / ⌘⇧G            | F3 / Shift+F3                             |
| Xoá scrollback (không hoàn tác)  | ⌘K                  | Ctrl+Shift+K                              |
| Sao chép vùng chọn               | ⌘C                  | Ctrl+Shift+C, hoặc Ctrl+C khi đang chọn   |
| Dán                              | ⌘V                  | Ctrl+V, Ctrl+Shift+V, Shift+Insert        |
| Sao chép thư mục đang làm việc   | ⌘⇧C                 | Ctrl+Alt+Shift+C                          |
| Phóng to / thu nhỏ / về mặc định | ⌘= / ⌘- / ⌘0        | Ctrl+= / Ctrl+- / Ctrl+0                  |
| Cuộn lên / xuống một trang       | ⇧PageUp / ⇧PageDown | Shift+PageUp / Shift+PageDown             |
| Cuộn lên đầu / xuống cuối        | ⇧Home / ⇧End        | Shift+Home / Shift+End                    |

## Các khu vực

| Thao tác                         | macOS | Windows      |
| -------------------------------- | ----- | ------------ |
| Bật / tắt sidebar                | ⌘B    | Ctrl+Shift+L |
| Bật / tắt side panel             | ⌘⇧J   | Ctrl+Shift+J |
| File explorer                    | ⌘⇧B   | Ctrl+Shift+B |
| Token usage                      | ⌘⇧U   | Ctrl+Shift+U |
| Trang chi tiết mức dùng          | ⌘⇧R   | Ctrl+Shift+R |
| Session history                  | ⌘⇧Y   | Ctrl+Shift+Y |
| Tab trình duyệt                  | ⌘⇧I   | Ctrl+Shift+I |
| Prompt Board                     | ⌘⇧P   | Ctrl+Shift+P |
| Lưu tài liệu đang mở             | ⌘S    | Ctrl+S       |
| Markdown: bản render ↔ mã nguồn  | ⌘⇧V   | —            |
| Settings                         | ⌘,    | Ctrl+,       |

## Layout preset

| Thao tác                                 | macOS | Windows          |
| ---------------------------------------- | ----- | ---------------- |
| Tạo layout preset mới từ đầu             | ⌘⇧N   | Ctrl+Alt+Shift+N |
| Lưu layout hiện tại thành preset         | ⌘⇧S   | Ctrl+Alt+Shift+S |

Preset là một kiểu chia pane có đặt tên, có thể kèm thư mục riêng cho từng pane. Preset tạo mới và
ghi đè được, nhưng không đổi tên hay xoá được từ trong app.

## Lưu ý

- Phím tắt nào không làm được gì ở chỗ bạn đang đứng thì sẽ không nuốt phím. Ví dụ, bấm một tổ hợp
  dành cho pane khi đang ở trong một tài liệu thì phím đó sẽ tới tài liệu.
- Trên macOS, các tổ hợp gắn với menu như Find và Clear Buffer bị thanh menu nhận trước khi tài
  liệu kịp thấy.
- Tổ hợp có phím ngoặc vuông và phím số được gán theo vị trí phím vật lý, nên vẫn dùng được với
  bàn phím không phải kiểu US.
- Trên Windows, Ctrl+S lưu tài liệu đang mở, nhưng chỉ khi panel của nó đang giữ focus bàn phím.
  Ở trên terminal thì phím đó vẫn đi vào terminal như trước giờ.
- ⌘⇧V không có phím tương ứng trên Windows vì Ctrl+Shift+V là dán. Thay vào đó, dùng nút chuyển
  trên khung tài liệu.
