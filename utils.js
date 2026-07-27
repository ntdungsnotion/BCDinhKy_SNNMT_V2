// Phiên bản ứng dụng: V2 — nâng cấp bảo mật
// Phiên bản file: Bước 8b-vá — utils.js, cập nhật 2026/07/27 13:53 (GMT+7):
//   thêm formatNgayGio(), tuongThuatLichSuNop(), ghiChuQuanTriGanNhat() —
//   dựng tường thuật nhiều dòng cho khung Tiến độ/Theo dõi theo mockup Mèo Đen.
// Phiên bản trước: Bước 8b — utils.js, cập nhật 2026/07/27 10:14 (GMT+7):
//   thêm apDungTanSuat() (khớp hệt hàm SQL cùng tên, tính ở giao diện để
//   ẩn/khoá Ô theo tần suất chỉ tiêu) và formatNgay() (hiển thị hạn nộp).
// ============================================================
// UTILS.JS — V2: HÀM TIỆN ÍCH DÙNG CHUNG
// Thứ tự load: supabase-js → config.js → db.js → utils.js
//
// KHÁC V1:
//   • Session: KHÔNG còn là chỗ giữ quyền — Supabase Auth giữ phiên (JWT),
//     RLS mới là hàng rào thật. laySession/luuSession chỉ là CACHE hiển thị
//     nhanh (tên, đơn vị, vai trò); nguồn sự thật là kiemTraDangNhap().
//   • Thêm sinhMaCot / sinhTieuDe cho cot_bao_cao (kỳ × loại).
//   • xuLyPaste dùng parseSo (xử lý đúng cả "10.000" VN lẫn "10,000.5" Anh/Mỹ
//     — bản V1 làm sạch thô nên "10,000.5" bị hiểu sai).
// ============================================================

const UTILS = {

  // ── SESSION (chỉ là cache hiển thị — quyền thật do Auth + RLS) ──
  // Key 'u2' tách khỏi 'u' của V1 để chạy song song không giẫm nhau.
  laySession() {
    try { return JSON.parse(localStorage.getItem('u2')); } catch { return null; }
  },
  luuSession(user) { localStorage.setItem('u2', JSON.stringify(user)); },
  xoaSession()     { localStorage.removeItem('u2'); },

  // Xác minh phiên THẬT với Supabase khi mở trang (không tin cache):
  // có phiên hợp lệ → làm tươi cache và trả hồ sơ; không → xóa cache, trả null
  // (trang chuyển về màn đăng nhập).
  async kiemTraDangNhap() {
    const nguoiDung = await DB.layNguoiDungHienTai();
    if (nguoiDung) {
      UTILS.luuSession(nguoiDung);
      // Seed GỢI Ý hệ định dạng từ hồ sơ (hệ người này hay dùng, có thể từ máy
      // khác) — dùng làm nút chọn sẵn / áp thẳng khi ô an toàn. localStorage
      // của MÁY này vẫn luôn đứng trên gợi ý này.
      UTILS.datHeGoiY(nguoiDung.he_dinh_dang || null);
    } else UTILS.xoaSession();
    return nguoiDung;
  },

  // ── TOAST ───────────────────────────────────────────────
  _toastTimer: null,
  toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast on ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
  },

  // ── MODAL ───────────────────────────────────────────────
  moModal(id)   { document.getElementById(id)?.classList.add('on'); },
  dongModal(id) { document.getElementById(id)?.classList.remove('on'); },

  // ── DOM ─────────────────────────────────────────────────
  bat(id) { document.getElementById(id)?.classList.add('on'); },
  tat(id) { document.getElementById(id)?.classList.remove('on'); },
  el(id)  { return document.getElementById(id); },

  // ── XÁC NHẬN ────────────────────────────────────────────
  xacNhan(title, msg, callback) {
    UTILS.el('xn-title').textContent = title;
    UTILS.el('xn-msg').innerHTML = msg;
    UTILS.el('xn-ok').onclick = () => { UTILS.dongModal('modal-xn'); callback(); };
    UTILS.moModal('modal-xn');
  },

  // ── MÔ HÌNH ĐƠN VỊ / 2 LOẠI ADMIN (MỚI Bước 6c/6d) ──────
  // Hàm THUẦN (không đụng DOM/mạng) để test độc lập — DB.layBangDuocXem và
  // 3 trang HTML chỉ gọi lại, không viết lại logic.

  // Gộp "bảng mình nhập" (don_vi_nhap_id = donViId) + "bảng được cấp quyền
  // đọc thêm" (dsMaBangDuocCap, danh sách mã bảng) → mảng bảng duy nhất,
  // khử trùng, giữ thứ tự theo thu_tu như dsBangAll.
  gopBangDuocXem(dsBangAll, donViId, dsMaBangDuocCap) {
    if (!donViId) return [];
    const capThem = new Set(dsMaBangDuocCap || []);
    return (dsBangAll || []).filter(b => b.don_vi_nhap_id === donViId || capThem.has(b.bang));
  },

  // true/false: người này có phải hỏi "ghi lý do sửa?" khi lưu số liệu của
  // bảng đang mở không — CHỈ khi là quản trị viên (2 loại) VÀ bảng có đơn vị
  // nhập rõ ràng KHÁC đơn vị của chính mình. Editor sửa bảng mình luôn không hỏi.
  canHoiLyDoSua(user, bang) {
    if (!user || !bang) return false;
    if (user.vai_tro !== 'admin' && user.vai_tro !== 'admin_han_che') return false;
    if (!bang.don_vi_nhap_id) return false;
    return bang.don_vi_nhap_id !== user.don_vi_id;
  },

  // Có phải một trong hai loại quản trị viên không (dùng cho việc hiển thị
  // menu/khối quản trị — la_admin() phía CSDL cũng gộp cả hai loại).
  laAdmin(user) { return !!user && (user.vai_tro === 'admin' || user.vai_tro === 'admin_han_che'); },

  // Chỉ admin TOÀN QUYỀN (không tính admin_han_che) — dùng để ẩn nút Xoá
  // danh mục / quản trị tài khoản ở giao diện (CSDL đã chặn ở tầng RLS,
  // đây chỉ là lớp UX chặn sớm, khớp la_admin_toan_quyen() phía CSDL).
  laAdminToanQuyen(user) { return !!user && user.vai_tro === 'admin'; },

  // Nhãn hiển thị vai trò — dùng chung cho sidebar 3 trang.
  nhanVaiTro(vaiTro) {
    return { admin: '⚙️ Quản trị viên', admin_han_che: '🛠️ Quản trị hạn chế', editor: '✏️ Người nhập liệu' }[vaiTro] || vaiTro || '';
  },

  // ── TẦN SUẤT CHỈ TIÊU (Bước 8b) — thuần JS, khớp HỆT hàm SQL
  // public.ap_dung_tan_suat(text,integer,integer) trong 11_va_ky_bao_cao.sql
  // Phần 4. Tính ở giao diện (không gọi RPC mỗi ô) vì lưới có thể có hàng
  // nghìn ô — đặc tả v4 mục 6 cố ý để việc ẩn/khoá này ở tầng giao diện,
  // KHÔNG chặn ở CSDL (tần suất là quy ước nghiệp vụ có thể đổi).
  // chiTieu cần có 3 trường: tan_suat, thang_tuy_chinh (mảng|null),
  // nam_dac_biet (mảng|null) — layChiTieuTheoBang() đã lấy đủ.
  // Thứ tự ưu tiên (ĐÚNG NHƯ SQL, không đổi):
  //   1) nam_dac_biet có giá trị → năm của cột phải thuộc danh sách
  //   2) thang_tuy_chinh có giá trị → tháng của cột phải thuộc danh sách
  //   3) không có cả hai → theo tan_suat: hang_thang mọi tháng,
  //      hang_quy chỉ tháng 3/6/9/12; giá trị khác (tương lai) coi như
  //      hang_thang (an toàn hơn là ẩn nhầm dữ liệu hợp lệ).
  apDungTanSuat(chiTieu, thang, nam) {
    if (!chiTieu) return true;
    if (chiTieu.nam_dac_biet && chiTieu.nam_dac_biet.length) {
      return chiTieu.nam_dac_biet.includes(nam);
    }
    if (chiTieu.thang_tuy_chinh && chiTieu.thang_tuy_chinh.length) {
      return chiTieu.thang_tuy_chinh.includes(thang);
    }
    if (chiTieu.tan_suat === 'hang_quy') return [3, 6, 9, 12].includes(thang);
    return true;
  },

  // Định dạng ngày kiểu Việt Nam dd/mm/yyyy — dùng cho han_nop (kiểu date,
  // Supabase trả 'YYYY-MM-DD'). Trả '' nếu rỗng/không hợp lệ (KHÔNG ném lỗi —
  // dữ liệu hạn nộp được PHÉP NULL, xem đặc tả v4 mục 10).
  formatNgay(d) {
    if (!d) return '';
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return '';
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  },

  // Định dạng "HH:MM dd/mm/yyyy" — dùng cho các mốc thời gian có giờ (nộp,
  // đề nghị, duyệt, trả lại...), khớp đúng kiểu hiển thị Mèo Đen yêu cầu
  // (vd "14:20 08/08/2026").
  formatNgayGio(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm} ${this.formatNgay(d)}`;
  },

  // Dựng tường thuật NHIỀU DÒNG cho một biểu từ mảng lich_su_nop của MỘT
  // (kỳ × biểu) — đã sắp CŨ→MỚI, có embed ho_so.ho_ten (xem
  // DB.layLichSuNopTheoKy). Dùng chung cho khung Tiến độ (index.html, chỉ
  // đọc) và Theo dõi (admin.html). Trả về MẢNG chuỗi (mỗi phần tử một dòng
  // để nối bằng <br>), rỗng nếu biểu chưa có vết nào.
  tuongThuatLichSuNop(dsLichSu) {
    if (!dsLichSu || !dsLichSu.length) return [];
    return dsLichSu.map(h => {
      const ten = h.ho_so?.ho_ten || '(không rõ)';
      const luc = this.formatNgayGio(h.luc);
      switch (h.hanh_dong) {
        case 'nop':     return `Nộp lúc ${luc}, người nộp: ${ten}`;
        case 'xin_sua': return `Đề nghị chỉnh sửa lúc ${luc}, người đề nghị: ${ten}${h.ly_do ? ' — ' + h.ly_do : ''}`;
        case 'duyet':   return `Đã duyệt mở lại lúc ${luc}, người duyệt: ${ten}`;
        case 'tu_choi': return `Từ chối đề nghị lúc ${luc}, người xử lý: ${ten}${h.ly_do ? ', lý do: ' + h.ly_do : ''}`;
        case 'tra_lai': return `Trả lại lúc ${luc}, người xử lý: ${ten}${h.ly_do ? ', lý do: ' + h.ly_do : ''}`;
        default:        return `${h.hanh_dong} lúc ${luc}, bởi: ${ten}`;
      }
    });
  },

  // Lý do của hành động QUẢN TRỊ gần nhất (trả lại / từ chối) trong lịch sử
  // của một biểu — cột "Ghi chú quản trị" ở Theo dõi (admin.html), theo
  // mockup Mèo Đen. GIỮ LẠI dù biểu đã nộp lại sau đó (vết cũ vẫn có ích để
  // admin nhớ lại đã từng trả lại vì lý do gì). Trả về '' nếu chưa từng có.
  ghiChuQuanTriGanNhat(dsLichSu) {
    if (!dsLichSu || !dsLichSu.length) return '';
    const dsQuanTri = dsLichSu.filter(h => h.hanh_dong === 'tra_lai' || h.hanh_dong === 'tu_choi');
    if (!dsQuanTri.length) return '';
    return dsQuanTri[dsQuanTri.length - 1].ly_do || '';
  },

  // ── CỘT BÁO CÁO (kỳ × loại) — sinh mã & tiêu đề ─────────
  // Quy ước ĐÃ CHỐT (mo_hinh_du_lieu_v2.md mục 3.2):
  //   loại thường : {loai}_{MM}/{nam}      → 'uoc_07/2026'
  //   kế hoạch    : KH{năm} + _hậu tố tùy chọn
  //                 → 'KH2027', 'KH2027_T7/2026', 'KH2027_PhanBoKH2026-2030'
  sinhMaCot(loai, thang, nam, hauTo) {
    if (loai === 'kh') {
      return 'KH' + nam + (hauTo ? '_' + String(hauTo).trim() : '');
    }
    return loai + '_' + String(thang).padStart(2, '0') + '/' + nam;
  },

  // Sinh tiêu đề cột từ khuôn mau_tieu_de của dm_loai_so_lieu.
  // Placeholder: {t} = tháng, {n} = năm. Vd "Ước tháng {t} năm {n}" → "Ước tháng 7 năm 2026"
  sinhTieuDe(mauTieuDe, thang, nam) {
    if (!mauTieuDe) return '';
    return String(mauTieuDe)
      .replace(/\{t\}/g, String(thang))
      .replace(/\{n\}/g, String(nam));
  },

  // ── SỐ LIỆU ─────────────────────────────────────────────
  // BỐI CẢNH: máy người nhập dùng định dạng số hỗn loạn (VN / Anh-Mỹ / tùy
  // chỉnh), và clipboard từ Excel chỉ mang CHUỖI HIỂN THỊ, không mang giá trị
  // gốc. Chuỗi "10.000" đứng MỘT MÌNH là mơ hồ tuyệt đối (VN = 10000,
  // Anh-Mỹ = 10) — không thuật toán nào đoán chắc được. Chiến lược V2:
  //   1) parseSo: đoán từng chuỗi theo quy tắc an toàn (thiên về VN khi mơ hồ
  //      — người dùng hệ này chủ yếu máy VN).
  //   2) doanHeDinhDang: khi dán CẢ KHỐI từ Excel, suy ra MỘT hệ định dạng
  //      chung từ mọi ô có manh mối (vd thấy "1,234.5" → cả máy đó là Anh-Mỹ,
  //      khi ấy "10.000" trong cùng khối được hiểu đúng là 10).
  //   3) Tầng cuối: cột gia_tri của so_lieu là NUMERIC — rác kiểu chữ bị CSDL
  //      từ chối thẳng, không còn cảnh số bẩn lọt vào như V1.
  // Ca mơ hồ còn sót (ô đơn lẻ "10.000" gõ tay/dán lẻ) sẽ xử lý ở Bước 5
  // bằng cách hiển thị lại số đã chuẩn hóa ngay trong ô để người nhập tự thấy.

  // ── TRÍ NHỚ HỆ ĐỊNH DẠNG CỦA MÁY (tích lũy qua các lần dán/tải file) ──
  // Định dạng số là thuộc tính của MÁY người dùng, không phải của một lần dán.
  // Manh mối thu được ở bất kỳ lần dán / file tải lên nào được ghi nhớ
  // (localStorage — bền qua cả phiên, cùng máy thì cùng hệ) và dùng lại cho
  // các lần sau không có manh mối. Manh mối MỚI ngược với trí nhớ → manh mối
  // mới thắng và ghi đè (trường hợp dán từ nguồn khác).
  layHeMay() {
    try { const h = localStorage.getItem('he2'); return (h === 'vn' || h === 'us') ? h : null; }
    catch { return null; }
  },
  luuHeMay(he) {
    if (he !== 'vn' && he !== 'us') return;
    try { localStorage.setItem('he2', he); } catch { /* bỏ qua */ }
  },
  // Rút manh mối từ một tập chuỗi; nếu kết luận được thì cập nhật trí nhớ.
  // Trả về hệ vừa kết luận ('vn'|'us') hoặc null nếu tập này mơ hồ.
  capNhatHeMay(dsChuoi) {
    const he = UTILS.doanHeDinhDang(dsChuoi);
    if (he) UTILS.luuHeMay(he);
    return he;
  },

  // ── LOCALE ĐẶT TAY CẤP MÁY (người dùng CHỦ ĐỘNG khai báo cho máy này) ──
  // Đây là "locale khai báo" kiểu Google/Excel, NHƯNG gắn với MÁY (localStorage
  // riêng 'he2_tay'), không với tài khoản — vì cán bộ dùng nhiều máy khác
  // locale, một cài đặt cấp tài khoản sẽ thành bẫy khi ngồi máy khác.
  // Khác trí nhớ suy tự động (he2): cái này do NGƯỜI xác nhận nên BỀN hơn —
  // manh mối mơ hồ không ghi đè nó; chỉ manh mối CHẮC ngược lại mới khiến hệ
  // thống HỎI LẠI (không tự lật). Đứng ngay dưới manh mối khối trong thứ bậc.
  layHeDatTay() {
    try { const h = localStorage.getItem('he2_tay'); return (h === 'vn' || h === 'us') ? h : null; }
    catch { return null; }
  },
  luuHeDatTay(he) {
    if (he !== 'vn' && he !== 'us') return;
    try {
      localStorage.setItem('he2_tay', he);
      localStorage.setItem('he2', he);   // đồng thời là trí nhớ máy hiện hành
    } catch { /* bỏ qua */ }
    UTILS.datHeGoiY(he);                  // nhất quán trong phiên
  },
  xoaHeDatTay() {                          // quay lại chế độ suy tự động
    try { localStorage.removeItem('he2_tay'); } catch { /* bỏ qua */ }
  },

  // ── GỢI Ý HỆ TỪ SQL (hồ sơ người dùng — hệ hay dùng trên MÁY KHÁC) ──
  // KHÁC BẢN CHẤT với layHeMay: localStorage đo ĐÚNG máy đang ngồi (cùng locale
  // gần như chắc chắn) → được TIN để áp thẳng cả ô rủi ro. Gợi ý SQL đo hệ
  // người này hay dùng, có thể đến từ MÁY KHÁC (cơ quan VN vs laptop nhà EN)
  // → chỉ được TIN tới mức GỢI Ý: chọn sẵn nút trong hộp hỏi, và áp thẳng
  // CHỈ KHI khối không có ô rủi ro cao. Bước đăng nhập (db.js) seed giá trị này.
  // Lưu trong biến bộ nhớ (không phải localStorage) vì nó gắn với PHIÊN người
  // dùng, không phải máy — đăng xuất là hết.
  _heGoiY: null,
  datHeGoiY(he) { UTILS._heGoiY = (he === 'vn' || he === 'us') ? he : null; },
  layHeGoiY()   { return UTILS._heGoiY; },

  // ── CỜ PHIÊN: "tự đọc manh mối NGƯỢC locale máy, đừng hỏi lại" ──
  // Trả lời câu hỏi "TÔI ĐANG LÀM GÌ LÚC NÀY" (một hoạt động — vd đang copy
  // một xấp số US từ Word vào máy cài VN), KHÁC với "máy này là gì" (locale
  // đặt tay, bền). Vì là hoạt động nên sống trong PHIÊN (biến bộ nhớ), mất khi
  // đóng tab / đăng xuất. Bật bởi lựa chọn "đừng hỏi lại trong phiên".
  //   _autoDocNguoc = hệ NGƯỢC được phép tự đọc (vd 'us' khi máy cài 'vn').
  // ĐIỀU KIỆN TỰ HỦY (quy tắc tối cao "nghi ngờ thì hỏi"): hễ gặp manh mối
  // RÕ RÀNG về ĐÚNG locale máy (vd khối VN rõ trên máy VN) → KHÔNG im lặng,
  // mà HỎI LẠI và tắt cờ (hoạt động cũ đã kết thúc, sang nguồn khác).
  // RANH GIỚI AN TOÀN: cờ này CHỈ tự xử manh mối US RÕ (1,234.5), TUYỆT ĐỐI
  // không đụng ô mơ hồ "10.000" — cái đó trên máy VN vẫn là mười nghìn.
  _autoDocNguoc: null,
  batAutoDocNguoc(heNguoc) { UTILS._autoDocNguoc = (heNguoc === 'vn' || heNguoc === 'us') ? heNguoc : null; },
  tatAutoDocNguoc()        { UTILS._autoDocNguoc = null; },
  layAutoDocNguoc()        { return UTILS._autoDocNguoc; },

  // Suy hệ định dạng chung của một tập chuỗi (khối dán từ Excel):
  //   'vn'  → chấm = nghìn, phẩy = thập phân
  //   'us'  → phẩy = nghìn, chấm = thập phân
  //   null  → không đủ manh mối / manh mối mâu thuẫn → đoán từng ô (parseSo)
  doanHeDinhDang(dsChuoi) {
    let vn = 0, us = 0;
    for (const raw of dsChuoi || []) {
      const s = String(raw ?? '').trim();
      if (!/\d/.test(s)) continue;
      const hasDot = s.includes('.'), hasComma = s.includes(',');
      if (hasDot && hasComma) {
        // Cả hai dấu → dấu đứng SAU là thập phân: manh mối chắc chắn
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) vn++; else us++;
      } else if (hasComma) {
        const p = s.split(',');
        if (p.length === 2 && p[1].length <= 2) vn++;      // "10,5"  → phẩy thập phân (VN)
        else if (p.length >= 3) us++;                      // "1,234,567" → phẩy nghìn (Anh-Mỹ)
        // "1,234" (một nhóm 3 số): mơ hồ → không tính
      } else if (hasDot) {
        const p = s.split('.');
        if (p.length === 2 && p[1].length !== 3) us++;     // "10.5"  → chấm thập phân (Anh-Mỹ)
        else if (p.length >= 3) vn++;                      // "1.234.567" → chấm nghìn (VN)
        // "1.234" (một nhóm 3 số): mơ hồ → không tính
      }
    }
    if (vn && !us) return 'vn';
    if (us && !vn) return 'us';
    return null;
  },

  // Phân tích sâu một tập chuỗi để quyết định CÓ NÊN HỎI NGƯỜI DÙNG không.
  // doanHeDinhDang chỉ trả hệ/null; hàm này trả thêm bối cảnh rủi ro:
  //   { he, soManhMoiVN, soManhMoiUS, mauThuan, coOMoHoRuiRo, heSuyRa }
  //   • he        : 'vn'|'us'|null — kết luận chắc chắn từ manh mối (như cũ)
  //   • mauThuan  : true nếu trong CÙNG khối vừa có manh mối VN vừa có US
  //                 (nghịch lý — không thể cùng một máy → phải hỏi)
  //   • coOMoHoRuiRo : có ô kiểu "10.000" / "1,234" (một nhóm 3 số) — ô mà
  //                 hiểu sai hệ sẽ lệch GẤP NGHÌN LẦN. Đây là ô nguy hiểm nhất.
  //   • heSuyRa   : hệ cuối sẽ dùng nếu KHÔNG hỏi. Thứ bậc:
  //                 manh mối khối (he) → trí nhớ MÁY (localStorage) →
  //                 gợi ý SQL — NHƯNG gợi ý SQL chỉ được vào heSuyRa khi khối
  //                 KHÔNG có ô rủi ro cao (vì SQL có thể từ máy khác locale).
  //                 Có ô rủi ro + chỉ có SQL → heSuyRa = null (sẽ đi hỏi).
  //   • heChonSan : hệ để CHỌN SẴN nút trong hộp hỏi (kể cả khi phải hỏi):
  //                 trí nhớ máy → gợi ý SQL → null. Giúp máy mới của người đã
  //                 có lịch sử chỉ cần bấm Enter.
  // Quy tắc "cần hỏi" (canHoiNguoiDung) dựa trên kết quả này.
  phanTichHe(dsChuoi) {
    let vn = 0, us = 0, moHoRuiRo = 0;
    for (const raw of dsChuoi || []) {
      const s = String(raw ?? '').trim();
      if (!/\d/.test(s)) continue;
      const hasDot = s.includes('.'), hasComma = s.includes(',');
      if (hasDot && hasComma) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) vn++; else us++;
      } else if (hasComma) {
        const p = s.split(',');
        if (p.length === 2 && p[1].length <= 2) vn++;
        else if (p.length >= 3) us++;
        else if (p.length === 2 && p[1].length === 3) moHoRuiRo++;  // "1,234"
      } else if (hasDot) {
        const p = s.split('.');
        if (p.length === 2 && p[1].length !== 3) us++;
        else if (p.length >= 3) vn++;
        else if (p.length === 2 && p[1].length === 3) moHoRuiRo++;  // "10.000"
      }
    }
    let he = null;
    if (vn && !us) he = 'vn';
    else if (us && !vn) he = 'us';

    const heTay   = UTILS.layHeDatTay();  // locale NGƯỜI đặt cho máy — điểm neo
    const heMay   = UTILS.layHeMay();     // localStorage — trí nhớ suy tự động
    const heGoiY  = UTILS.layHeGoiY();    // SQL — có thể từ máy khác
    const heAuto  = UTILS.layAutoDocNguoc(); // cờ phiên "tự đọc ngược, đừng hỏi"
    const coRuiRo = moHoRuiRo > 0;

    // XUNG ĐỘT: khối có manh mối CHẮC (he) NGƯỢC với locale đặt tay.
    // Đây là ca "đặt VN, dán số US từ Word" — quy tắc tối cao: NGHI NGỜ THÌ HỎI,
    // KHÔNG tự lật cài đặt, KHÔNG âm thầm theo khối.
    const xungDotTay = !!(heTay && he && he !== heTay);
    // Cờ phiên gặp manh mối VỀ ĐÚNG locale máy (ngược chính nó) → phải hỏi lại.
    const nguocLaiAuto = !!(heAuto && he && he === heTay);

    // heSuyRa — hệ áp khi KHÔNG phải hỏi. Thứ bậc (trên xuống):
    //   manh mối khối (nếu KHÔNG xung đột cài tay) → locale đặt tay →
    //   trí nhớ máy → gợi ý SQL (chỉ khi ô an toàn).
    let heSuyRa = null;
    if (he && !xungDotTay) heSuyRa = he;      // dữ liệu rõ, không cãi cài đặt
    else if (heTay)        heSuyRa = heTay;   // điểm neo do người xác nhận
    else                   heSuyRa = heMay;
    if (!heSuyRa && !coRuiRo) heSuyRa = heGoiY;  // an toàn mới tin SQL

    return {
      he,
      soManhMoiVN: vn, soManhMoiUS: us,
      mauThuan: vn > 0 && us > 0,
      coOMoHoRuiRo: coRuiRo,
      xungDotTay,             // manh mối chắc ngược locale đặt tay
      nguocLaiAuto,           // cờ phiên gặp manh mối về đúng máy
      heTay: heTay || null,   // locale đặt tay (để hộp hỏi hiển thị)
      heSuyRa: heSuyRa || null,
      // nút chọn sẵn: ưu tiên locale đặt tay → trí nhớ máy → gợi ý SQL
      heChonSan: heTay || heMay || heGoiY || null,
    };
  },

  // CHỐT CHẶN CUỐI: có nên DỪNG LẠI HỎI người dùng thay vì đoán thầm?
  // Trả về { hoi, ly_do, pt, heChonSan }. Quy tắc tối cao: NGHI NGỜ THÌ HỎI.
  // Thứ tự xét (dừng ở nhánh khớp đầu tiên):
  //   1) XUNG ĐỘT cài tay: khối US rõ mà máy đặt VN (hoặc ngược) → hỏi, TRỪ KHI
  //      cờ phiên "tự đọc ngược" đang bật đúng chiều đó (người đã chọn đừng hỏi).
  //   2) Cờ phiên đang bật mà khối lộ manh mối VỀ ĐÚNG máy → hỏi lại + (giao
  //      diện sẽ tatAutoDocNguoc): hoạt động cũ kết thúc, sang nguồn khác.
  //   3) MÂU THUẪN trong khối (vừa VN vừa US) → luôn hỏi.
  //   4) Ô mơ hồ rủi ro cao mà khối không kết luận được VÀ chưa có locale đặt
  //      tay/trí nhớ máy → hỏi (có gợi ý SQL vẫn hỏi, nút chọn sẵn theo SQL).
  // Còn lại → không hỏi, áp heSuyRa.
  canHoiNguoiDung(dsChuoi) {
    const pt = UTILS.phanTichHe(dsChuoi);
    const heAuto = UTILS.layAutoDocNguoc();

    // (1) Xung đột với locale đặt tay
    if (pt.xungDotTay) {
      // Người đã bật "tự đọc ngược" đúng chiều manh mối → im lặng đọc theo khối.
      if (heAuto && pt.he === heAuto)
        return { hoi: false, ly_do: '', pt, heChonSan: pt.heChonSan, apDung: pt.he };
      return { hoi: true, ly_do: 'xung_dot_cai_tay', pt, heChonSan: pt.heChonSan };
    }
    // (2) Cờ phiên gặp manh mối về đúng máy → hỏi lại (và tắt cờ ở giao diện)
    if (pt.nguocLaiAuto)
      return { hoi: true, ly_do: 'auto_gap_nguoc', pt, heChonSan: pt.heChonSan };
    // (3) Mâu thuẫn trong khối
    if (pt.mauThuan)
      return { hoi: true, ly_do: 'mau_thuan', pt, heChonSan: pt.heChonSan };
    // (4) Ô rủi ro cao, chưa biết gì chắc
    if (pt.coOMoHoRuiRo && !pt.he && !pt.heTay && !UTILS.layHeMay())
      return { hoi: true, ly_do: 'mo_ho_chua_biet', pt, heChonSan: pt.heChonSan };
    return { hoi: false, ly_do: '', pt, heChonSan: pt.heChonSan };
  },

  // Parse một chuỗi theo hệ đã biết ('vn' | 'us'); hệ null → parseSo tự đoán.
  parseSoTheoHe(str, he) {
    if (str === '' || str === null || str === undefined) return null;
    const s = String(str).trim();
    if (s === '') return null;
    let n;
    if (he === 'vn')      n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (he === 'us') n = parseFloat(s.replace(/,/g, ''));
    else                  return UTILS.parseSo(s);
    return isNaN(n) ? null : n;
  },

  // Làm sạch chuỗi số — xử lý an toàn cả hai hệ (VN và quốc tế):
  //   "10.000"   → 10000  (chấm là phân cách hàng nghìn VN)
  //   "10.5"     → 10.5   (chấm là thập phân kiểu quốc tế)
  //   "10.000,5" → 10000.5
  //   "10,5"     → 10.5   (phẩy là thập phân VN)
  //   "10,000.5" → 10000.5 (định dạng Anh/Mỹ)
  parseSo(str) {
    if (str === '' || str === null || str === undefined) return null;
    const s = String(str).trim();
    if (s === '') return null;

    const hasDot   = s.includes('.');
    const hasComma = s.includes(',');

    let normalized;
    if (hasDot && hasComma) {
      // Cả hai dấu → xác định thứ tự: dấu nào xuất hiện SAU là thập phân
      const lastDot   = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) {
        // Kiểu VN: 10.000,50 → bỏ chấm, đổi phẩy thành chấm
        normalized = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Kiểu Anh/Mỹ: 10,000.50 → bỏ phẩy
        normalized = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      // Chỉ có phẩy
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // "10,5" hoặc "10,50" → thập phân VN
        normalized = s.replace(',', '.');
      } else {
        // "10,000" → phân cách hàng nghìn → bỏ phẩy
        normalized = s.replace(/,/g, '');
      }
    } else if (hasDot && !hasComma) {
      // Chỉ có chấm
      const parts = s.split('.');
      const lastPart = parts[parts.length - 1];
      if (parts.length === 2 && lastPart.length !== 3) {
        // "10.5" hoặc "10.50" → thập phân quốc tế
        normalized = s;
      } else {
        // "10.000" hoặc "1.000.000" → phân cách hàng nghìn VN → bỏ chấm
        normalized = s.replace(/\./g, '');
      }
    } else {
      // Không có dấu gì
      normalized = s;
    }

    const n = parseFloat(normalized);
    return isNaN(n) ? null : n;
  },

  // Format số hiển thị chuẩn vi-VN:
  //   10000     → "10.000"
  //   10000.4   → "10.000,4"
  //   10000.45  → "10.000,45"
  //   10000.456 → "10.000,46" (làm tròn 2 thập phân)
  //   Không có thập phân → không hiện phần thập phân
  formatSo(n) {
    if (n === null || n === undefined || n === '') return '';
    const num = Number(n);
    if (isNaN(num)) return String(n);
    // Xác định số chữ số thập phân thực tế (tối đa 2)
    const decimals = Math.min(
      (String(Math.round(num * 100) / 100).split('.')[1] || '').length,
      2
    );
    return num.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  },

  // ── INDENT ──────────────────────────────────────────────
  demKhoang(str) {
    const m = str.match(/^(\s+)/);
    return m ? m[1].length : 0;
  },

  // ── EXPORT EXCEL ────────────────────────────────────────
  // Xuất bảng nhập liệu ra Excel (dùng SheetJS nếu có, fallback CSV)
  xuatExcel(tenFile, headers, rows) {
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bieu mau');
      // Style header
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: '1B4332' } } };
      }
      XLSX.writeFile(wb, tenFile + '.xlsx');
    } else {
      // Fallback: xuất CSV
      const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = tenFile + '.csv';
      a.click();
    }
  },

  // ── ĐỌC FILE EXCEL TẢI LÊN (đường nhập TRIỆT ĐỂ nhất) ───
  // File .xlsx/.xls lưu GIÁ TRỊ GỐC dạng số bên trong, TÁCH KHỎI định dạng
  // hiển thị → đọc raw:true thì ô kiểu số ra thẳng con số, miễn nhiễm hoàn
  // toàn với định dạng máy (VN/Anh-Mỹ/tùy chỉnh đều đúng). Bước 5 nên ưu
  // tiên kênh nhập này. Chỉ ô "số gõ vào ô kiểu Text" mới là chuỗi cần
  // parse — toàn bộ chuỗi trong file được rút manh mối vào trí nhớ máy.
  // (CSV không phải xlsx: vẫn là chuỗi thuần → đi đường xuLyPaste/parseSoTheoHe.)
  // Trả về mảng 2 chiều [dòng][cột]: số giữ nguyên là number, chữ là string,
  // ô trống = null. Cần SheetJS (XLSX) đã load — như xuatExcel.
  async docExcel(file) {
    if (typeof XLSX === 'undefined') throw new Error('Thiếu thư viện SheetJS (XLSX).');
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const dong = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    // Chuỗi trong file cũng là manh mối định dạng của máy đã tạo file
    UTILS.capNhatHeMay(dong.flat().filter(v => typeof v === 'string'));
    return dong;
  },

  // Chuẩn hóa một ô (từ docExcel hoặc bất kỳ nguồn nào) về số:
  //   number → giữ nguyên (giá trị gốc, không đụng);
  //   string → parse theo hệ (mặc định: trí nhớ máy);
  //   rỗng/không phải số → null.
  // Bước 5 chỉ áp hàm này cho cột của chỉ tiêu kieu_du_lieu='number'
  // (cột ghi chú/kiểu chữ giữ nguyên chuỗi, đổ vào gia_tri_text).
  oThanhSo(v, he) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    return UTILS.parseSoTheoHe(v, he !== undefined ? he : UTILS.layHeMay());
  },

  // Diễn giải LẠI các ô đã dán trước đó theo hệ vừa phát hiện.
  // Nguyên lý: parse sai là mất thông tin MỘT CHIỀU ("10.000"→10000 thì không
  // suy ngược được), nên mỗi ô dán đều giữ CHUỖI GỐC trong data-goc; khi manh
  // mối đến muộn cho biết hệ thật, mọi ô còn nguyên chuỗi gốc được parse lại
  // từ gốc. Ô người dùng đã SỬA TAY sau khi dán thì data-goc bị xóa (sự kiện
  // 'input') → không bị đụng vào. Ô đã LƯU xuống CSDL: giá trị mới + sự kiện
  // 'change' làm trang đánh dấu "chưa lưu" trở lại → bấm Lưu là upsert đè
  // giá trị sai (PK (id_chi_tieu, cot_id) bảo đảm đè đúng ô).
  // Trả về số ô đã đổi giá trị.
  dinhGiaLaiODan(heMoi) {
    if (heMoi !== 'vn' && heMoi !== 'us') return 0;
    let doi = 0;
    document.querySelectorAll('.o-so[data-goc]').forEach(inp => {
      const num = UTILS.parseSoTheoHe(inp.dataset.goc, heMoi);
      const moi = num === null ? '' : String(num);
      if (inp.value !== moi) {
        inp.value = moi;
        inp.classList.toggle('has', moi !== '');
        inp.dispatchEvent(new Event('change'));
        doi++;
      }
    });
    return doi;
  },

  // ── PASTE TỪ EXCEL ──────────────────────────────────────
  // Xử lý paste dữ liệu từ Excel vào bảng. currentInput: ô input đang focus.
  // Khác V1 (làm sạch thô "bỏ chấm, phẩy→chấm" → số Anh/Mỹ luôn bị hiểu sai):
  // suy MỘT hệ định dạng chung từ cả khối dán rồi áp thống nhất.
  //
  // CHỐT CHẶN CUỐI (mới): khi manh mối CHƯA ĐỦ TIN CẬY (mâu thuẫn, hoặc có ô
  // "10.000"/"1,234" mà chưa biết hệ), KHÔNG đoán thầm — dừng lại, giữ chuỗi
  // gốc trong ô (chưa parse) và gọi onHoiHe(chọn) để giao diện hỏi người dùng
  // "máy này dùng định dạng nào?". Người dùng chọn xong, giao diện gọi lại
  //   UTILS.apDungHeChoODan(he)   → parse mọi ô đang chờ theo hệ đã chọn.
  //
  // Tham số:
  //   e, currentInput : như cũ
  //   opts.onHoiHe(pt): callback khi CẦN HỎI (pt = phanTichHe để hiển thị);
  //                     nếu không truyền, rơi về hành vi cũ (đoán, thiên VN).
  //   opts.onXong(msg,type): callback báo kết quả (thay cho toast mặc định).
  xuLyPaste(e, currentInput, opts = {}) {
    const clip = (e.clipboardData || window.clipboardData).getData('text');
    if (!clip.includes('\t') && !clip.includes('\n')) return; // paste đơn, bỏ qua

    e.preventDefault();
    const rows = clip.replace(/\r/g, '').split('\n').map(r => r.split('\t'));

    const table   = currentInput.closest('table');
    const allRows = table ? [...table.querySelectorAll('tbody tr:not(.tr-h)')] : [];
    const startRow = currentInput.closest('tr');
    const rowIdx   = allRows.indexOf(startRow);
    if (rowIdx === -1) return;
    const startColInRow = [...startRow.querySelectorAll('.o-so:not(:disabled)')]
      .indexOf(currentInput);
    if (startColInRow === -1) return;

    // BƯỚC 1 — đổ chuỗi GỐC vào các ô, đánh dấu "chờ parse" (chưa hiểu số vội).
    // Giữ data-goc để parse (lại) theo hệ; data-cho-parse đánh dấu ô của đợt này.
    const oCho = [];
    rows.forEach((pasteRow, ri) => {
      const targetTR = allRows[rowIdx + ri];
      if (!targetTR) return;
      const targetInputs = [...targetTR.querySelectorAll('.o-so:not(:disabled)')];
      pasteRow.forEach((val, ci) => {
        const inp = targetInputs[startColInRow + ci];
        if (!inp) return;
        inp.dataset.goc = val;
        inp.dataset.choParse = '1';
        // Người dùng sửa tay ô này → bỏ cả gốc lẫn cờ chờ, không đụng nữa.
        inp.addEventListener('input', () => {
          delete inp.dataset.goc; delete inp.dataset.choParse;
        }, { once: true });
        oCho.push(inp);
      });
    });

    // BƯỚC 2 — quyết định: đủ tin cậy thì áp ngay; chưa đủ thì HỎI.
    const kt = UTILS.canHoiNguoiDung(rows.flat());

    // Ngữ cảnh chung cho mọi lối ra (các hàm loc* đọc từ đây).
    UTILS._paste = {
      onXong:  opts.onXong  || null,
      onLuuSQL: opts.onLuuSQL || null,
      heKhoi:  kt.pt.he || null,      // hệ manh mối khối (chiều xung đột)
      heTay:   kt.pt.heTay || null,   // locale đặt tay hiện tại
    };

    if (kt.hoi && typeof opts.onHoiHe === 'function') {
      // Nếu là ca cờ phiên gặp manh mối về đúng máy → giao diện sẽ tự tắt cờ
      // sau khi hỏi; ta báo trước để hộp hỏi hiển thị đúng thông điệp.
      opts.onHoiHe(kt.pt, kt.ly_do, kt.heChonSan);   // mở hộp hỏi; DỪNG tại đây
      return;
    }

    // Không phải hỏi: có thể là "auto im lặng đọc theo khối" (kt.apDung) hoặc
    // áp hệ suy ra bình thường.
    const heAp = (kt.apDung !== undefined && kt.apDung !== null) ? kt.apDung : kt.pt.heSuyRa;
    // Auto đọc ngược: KHÔNG ghi vào máy (giữ locale cũ), chỉ đọc lần này.
    const luuMay = !(kt.apDung && UTILS.layAutoDocNguoc());
    UTILS.apDungHeChoODan(heAp, opts.onXong, luuMay);
  },

  // Parse mọi ô đang "chờ parse" theo hệ đã chọn/suy ra, rồi soát lại các ô
  // đã dán TRƯỚC đó (diễn giải lại nếu hệ này khác hệ cũ đã áp cho chúng).
  // Gọi trực tiếp sau khi người dùng chọn hệ trong hộp hỏi.
  //   luuVaoMay=true (mặc định): ghi hệ vào trí nhớ máy + đồng bộ SQL.
  //   luuVaoMay=false: CHỈ đọc lần dán này theo hệ, KHÔNG đụng trí nhớ/cài đặt
  //     (dùng cho lối "chỉ sửa lần này" — máy vẫn giữ locale cũ).
  apDungHeChoODan(he, onXong, luuVaoMay = true) {
    if ((he === 'vn' || he === 'us') && luuVaoMay) {
      UTILS.luuHeMay(he);                          // nhớ vào MÁY (localStorage)
      // Đồng bộ ngược lên SQL nếu khác gợi ý hiện tại (người này vừa xác lập
      // hệ trên máy đang ngồi — cập nhật hồ sơ để máy khác seed đúng lần sau).
      if (he !== UTILS.layHeGoiY()) {
        const luuSQL = UTILS._paste && UTILS._paste.onLuuSQL;
        UTILS.datHeGoiY(he);
        if (typeof luuSQL === 'function') { try { luuSQL(he); } catch { /* bỏ qua */ } }
      }
    }
    let changed = 0;
    document.querySelectorAll('.o-so[data-cho-parse]').forEach(inp => {
      const num = UTILS.parseSoTheoHe(inp.dataset.goc, he);
      inp.value = num === null ? '' : num;
      inp.classList.toggle('has', inp.value !== '');
      delete inp.dataset.choParse;              // hết chờ; vẫn giữ data-goc
      inp.dispatchEvent(new Event('change'));
      changed++;
    });
    // Soát lại các ô dán trước CHỈ khi ghi vào máy (đổi cài đặt/xác lập hệ).
    // Lối "chỉ lần này" không đụng ô cũ (chúng thuộc locale máy, không đổi).
    const doi = (luuVaoMay && (he === 'vn' || he === 'us')) ? UTILS.dinhGiaLaiODan(he) : 0;
    const bao = UTILS._paste && UTILS._paste.onXong ? UTILS._paste.onXong
              : (onXong || ((m, t) => UTILS.toast(m, t)));
    const tenHe = he === 'vn' ? 'Việt Nam' : 'Anh-Mỹ';
    if (doi > 0)
      bao(`⚠ Đã áp định dạng ${tenHe} và diễn giải lại ${doi} ô dán trước đó. Kiểm tra và bấm Lưu lại!`, 'warn');
    else
      bao(`✅ Đã dán ${changed} ô${he ? ' (đọc theo định dạng ' + tenHe + ')' : ''}.`, 'ok');
    UTILS._paste = null;
  },

  // ── BỐN LỐI RA của hộp hỏi khi XUNG ĐỘT cài tay (đặt VN, dán US) ──
  // Giao diện gọi đúng một trong bốn hàm này theo nút người dùng bấm.
  // pt = kết quả phanTichHe (có pt.he = hệ manh mối khối, pt.heTay = cài đặt).

  // (1) "Chỉ đọc số lần dán này theo <hệ khối>" — GIỮ nguyên cài đặt máy.
  locChiLanNay() {
    UTILS.apDungHeChoODan(UTILS._paste && UTILS._paste.heKhoi, null, false);
  },

  // (2) "Đổi cài đặt máy này sang <hệ khối>" — ghi locale đặt tay mới + soát ô cũ.
  locDoiCaiDat() {
    const he = UTILS._paste && UTILS._paste.heKhoi;
    if (he === 'vn' || he === 'us') UTILS.luuHeDatTay(he);   // điểm neo mới
    UTILS.apDungHeChoODan(he, null, true);
  },

  // (3) "Đừng hỏi lại trong phiên — tự đọc <hệ khối> khi gặp" — bật cờ phiên,
  //     GIỮ cài đặt máy. Lần dán này đọc theo hệ khối, không ghi trí nhớ.
  locDungHoiTrongPhien() {
    const he = UTILS._paste && UTILS._paste.heKhoi;
    UTILS.batAutoDocNguoc(he);                 // cờ phiên (mất khi đóng tab)
    UTILS.apDungHeChoODan(he, null, false);
  },

  // (4) "Số này vốn là <hệ máy>, đọc thẳng" — người dùng khẳng định khối KHÔNG
  //     phải hệ kia (vd nhìn giống US nhưng thực ra gõ nhầm) → đọc theo cài đặt.
  locDocTheoCaiDat() {
    const he = (UTILS._paste && UTILS._paste.heTay) || UTILS.layHeDatTay();
    UTILS.apDungHeChoODan(he, null, false);
  },

  // ── LỐI RA cho ca "auto_gap_nguoc" (cờ phiên đang bật, khối lộ manh mối
  //    VỀ ĐÚNG máy — vd đang tự đọc US, giờ dán khối VN rõ từ Excel chuẩn) ──
  // (A) "Đúng, chuyển về đọc theo máy" → TẮT cờ phiên, đọc khối theo hệ máy.
  locChuyenVeMay() {
    UTILS.tatAutoDocNguoc();                    // hoạt động cũ kết thúc
    const he = (UTILS._paste && UTILS._paste.he) ||
               (UTILS._paste && UTILS._paste.heTay) || UTILS.layHeDatTay();
    UTILS.apDungHeChoODan(he, null, false);
  },
  // (B) "Không, vẫn đọc theo <hệ auto>" → GIỮ cờ phiên, đọc khối theo hệ auto.
  locVanGiuAuto() {
    const he = UTILS.layAutoDocNguoc();
    UTILS.apDungHeChoODan(he, null, false);
  },
};
