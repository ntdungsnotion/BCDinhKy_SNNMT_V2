// ============================================================
// DB.JS — V2: TẦNG TRUY VẤN SUPABASE (Auth + RLS + mô hình 3 chiều)
// Yêu cầu load trước: supabase-js v2 (CDN) → config.js → db.js
//
// KHÁC V1 (bảng ánh xạ nhanh cho Bước 5–6):
//   V1                                  →  V2
//   ─────────────────────────────────────────────────────────────
//   layDanhSachTaiKhoan/layTatCaTaiKhoan→  layTatCaHoSo (bảng ho_so)
//   layTaiKhoanDayDu(id)                →  layHoSo(uuid)
//   doiMatKhau(id, mk) (bảng tai_khoan) →  doiMatKhauCuaToi(mk) (Supabase Auth)
//   đăng nhập so mật khẩu ở frontend    →  dangNhap(email, mk) (signInWithPassword)
//   layKyHienThi / layTatCaKy           →  layCotHienThi / layTatCaCot
//   themKy / capNhatKy / xoaKy          →  themCot / capNhatCot / xoaCot
//   luuDoRongKy(maKy, w)                →  luuDoRongCot(cotId, w)
//   layDuLieu(maBang, dsKy)             →  layDuLieu(maBang, dsCotId)
//   luuDuLieu(maBang, rows)             →  luuDuLieu(rows) — một bảng so_lieu,
//                                          tự gắn nguoi_nhap = uuid đang đăng nhập
//   laySoSanh: cột ky_tu/ky_mau         →  cột cot_tu/cot_mau (id của cot_bao_cao)
//   layPhanQuyen(taiKhoanId số)         →  layPhanQuyen(userId uuid)
//
// QUYỀN: mọi hàm đọc yêu cầu ĐÃ ĐĂNG NHẬP (RLS chặn anon).
// Hàm ghi danh mục (bảng, chỉ tiêu, cột, loại, gsheet, so sánh, phân quyền)
// chỉ admin thực hiện được — editor gọi sẽ bị RLS trả lỗi / 0 dòng.
// ============================================================

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const DB = {

  // ── ĐĂNG NHẬP / PHIÊN (Supabase Auth) ──────────────────
  // Đăng nhập bằng email + mật khẩu. Trả về hồ sơ gộp
  // { id, email, ho_ten, don_vi, vai_tro } để trang lưu cache hiển thị
  // (UTILS.luuSession). Tài khoản ngưng dùng bị chặn 2 lớp:
  // banned_until (Auth) + kiểm tra ho_so.trang_thai ở đây.
  async dangNhap(email, matKhau) {
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: matKhau,
    });
    if (error) throw error;

    const hoSo = await this.layHoSo(data.user.id);
    if (!hoSo || hoSo.trang_thai === false) {
      await sb.auth.signOut();
      throw new Error('Tài khoản đã ngưng sử dụng. Liên hệ quản trị viên.');
    }
    return {
      id:      data.user.id,
      email:   data.user.email,
      ho_ten:  hoSo.ho_ten,
      don_vi:  hoSo.don_vi,
      vai_tro: hoSo.vai_tro,
      he_dinh_dang: hoSo.he_dinh_dang || null,   // gợi ý hệ định dạng số (seed máy mới)
    };
  },

  async dangXuat() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  },

  // Người đang đăng nhập (kiểm tra phiên thật với Supabase, không tin cache).
  // Trả về hồ sơ gộp như dangNhap(), hoặc null nếu chưa đăng nhập /
  // tài khoản đã bị ngưng.
  async layNguoiDungHienTai() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    let hoSo = null;
    try { hoSo = await this.layHoSo(session.user.id); } catch { hoSo = null; }
    if (!hoSo || hoSo.trang_thai === false) return null;
    return {
      id:      session.user.id,
      email:   session.user.email,
      ho_ten:  hoSo.ho_ten,
      don_vi:  hoSo.don_vi,
      vai_tro: hoSo.vai_tro,
      he_dinh_dang: hoSo.he_dinh_dang || null,
    };
  },

  // Ghi hệ định dạng số hay dùng của CHÍNH MÌNH vào ho_so (RLS: editor tự sửa
  // hồ sơ mình đã cho phép). utils.js gọi hàm này qua callback onLuuSQL mỗi khi
  // người dùng xác lập hệ chắc chắn trên máy đang ngồi — để máy khác seed đúng
  // ở lần đăng nhập sau. Chỉ nhận 'vn' | 'us'.
  async luuHeDinhDang(he) {
    if (he !== 'vn' && he !== 'us') return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error } = await sb
      .from(CONFIG.BANG.HO_SO)
      .update({ he_dinh_dang: he }).eq('id', user.id);
    if (error) throw error;
  },

  // Tự đổi mật khẩu của CHÍNH MÌNH (Auth). Đặt lại mật khẩu cho người khác
  // là việc của admin: Dashboard → Authentication → Users, hoặc PHẦN 1B
  // trong 03_auth_rls.sql (publishable key không có quyền admin API).
  async doiMatKhauCuaToi(matKhauMoi) {
    const { error } = await sb.auth.updateUser({ password: matKhauMoi });
    if (error) throw error;
  },

  // Theo dõi biến động phiên (đăng nhập/đăng xuất/hết hạn) — dùng ở Bước 5
  // để tự quay về màn đăng nhập khi phiên hết hạn.
  onAuthChange(callback) {
    return sb.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  // Tạo tài khoản Auth mới (admin dùng ở trang quản trị, Bước 6b).
  // Dùng client PHỤ không lưu phiên — signUp trên client chính sẽ ĐÁ phiên
  // admin đang đăng nhập. Trigger trg_tao_ho_so tự tạo dòng ho_so từ metadata.
  // Yêu cầu Dashboard: Authentication → Sign In/Up → Email bật, Confirm email TẮT.
  async taoTaiKhoan(email, matKhau, { don_vi = '', ho_ten = '', vai_tro = 'editor' } = {}) {
    const sbTao = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sbTao.auth.signUp({
      email: String(email || '').trim().toLowerCase(),
      password: matKhau,
      options: { data: { don_vi, ho_ten, vai_tro: vai_tro === 'admin' ? 'admin' : 'editor' } },
    });
    if (error) throw error;
    return data.user;      // { id, email, ... }
  },

  // ── HỒ SƠ NGƯỜI DÙNG (ho_so, 1-1 với auth.users) ───────
  // RLS: editor chỉ đọc được hồ sơ của mình; admin đọc/sửa tất cả.
  async layHoSo(userId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.HO_SO)
      .select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;           // null nếu không có / không được đọc
  },

  // Danh sách hồ sơ (admin). Lưu ý: ho_so KHÔNG chứa email (email nằm trong
  // auth.users — API không lộ ra). Trang quản trị hiển thị theo ho_ten/don_vi;
  // nếu Bước 6b cần cột email sẽ bổ sung một hàm SQL SECURITY DEFINER riêng.
  async layTatCaHoSo() {
    const { data, error } = await sb
      .from(CONFIG.BANG.HO_SO)
      .select('*')
      .order('vai_tro').order('don_vi');
    if (error) throw error;
    return data || [];
  },

  // Admin sửa hồ sơ (đơn vị, họ tên, vai trò, trạng thái).
  // Editor tự sửa được ho_ten của mình; RLS cấm tự đổi vai_tro/trang_thai/don_vi.
  async suaHoSo(userId, row) {
    const { error } = await sb
      .from(CONFIG.BANG.HO_SO)
      .update(row).eq('id', userId);
    if (error) throw error;
  },

  // ── DANH SÁCH BẢNG ─────────────────────────────────────
  async layTatCaBang() {
    const { data, error } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .select('*').order('thu_tu');
    if (error) throw error;
    return data || [];
  },

  // Bảng mà một user được phân quyền nhập (khóa theo uuid — khác V1 dùng id số)
  async layBangDuocPhep(userId) {
    const { data: pq, error } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .select('bang').eq('user_id', userId);
    if (error) throw error;
    const maBangs = (pq || []).map(r => r.bang);
    if (!maBangs.length) return [];
    const { data, error: e2 } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .select('*').in('bang', maBangs).order('thu_tu');
    if (e2) throw e2;
    return data || [];
  },

  // V2 thêm bảng mới KHÔNG cần CREATE TABLE (đã gộp so_lieu) — chỉ 1 insert.
  async themBang(row) {
    const { error } = await sb.from(CONFIG.BANG.DANH_SACH_BANG).insert(row);
    if (error) throw error;
  },

  async capNhatBang(maBang, row) {
    const { error } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .update(row).eq('bang', maBang);
    if (error) throw error;
  },

  // Xóa bảng: FK chi_tieu.bang là ON DELETE RESTRICT → bảng còn chỉ tiêu
  // sẽ bị chặn (đúng chủ đích, tránh mất dữ liệu).
  async xoaBang(maBang) {
    const { error } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .delete().eq('bang', maBang);
    if (error) throw error;
  },

  // ── LOẠI SỐ LIỆU (dm_loai_so_lieu — chiều thứ 3, MỚI) ──
  async layLoaiSoLieu() {
    const { data, error } = await sb
      .from(CONFIG.BANG.LOAI_SO_LIEU)
      .select('*')
      .order('thu_tu', { ascending: true, nullsFirst: false })
      .order('ma');
    if (error) throw error;
    return data || [];
  },

  async themLoai(row) {
    const { error } = await sb.from(CONFIG.BANG.LOAI_SO_LIEU).insert(row);
    if (error) throw error;
  },

  async suaLoai(ma, row) {
    const { error } = await sb
      .from(CONFIG.BANG.LOAI_SO_LIEU)
      .update(row).eq('ma', ma);
    if (error) throw error;
  },

  // FK cot_bao_cao.loai là RESTRICT → loại đang có cột sẽ không xóa được.
  async xoaLoai(ma) {
    const { error } = await sb
      .from(CONFIG.BANG.LOAI_SO_LIEU)
      .delete().eq('ma', ma);
    if (error) throw error;
  },

  // ── CỘT BÁO CÁO (cot_bao_cao = kỳ × loại — thay ky_bao_cao V1) ──
  // Cột hiện ở trang nhập liệu (tương đương layKyHienThi V1)
  async layCotHienThi() {
    const { data, error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .select('*')
      .eq('dua_vao_bieu', true)
      .order('thu_tu_hien_thi', { ascending: true, nullsFirst: false })
      .order('nam', { ascending: false })
      .order('thang', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async layTatCaCot(namBatDau, namKetThuc) {
    let q = sb.from(CONFIG.BANG.COT_BAO_CAO).select('*');
    if (namBatDau) q = q.gte('nam', namBatDau);
    if (namKetThuc) q = q.lte('nam', namKetThuc);
    q = q.order('nam', { ascending: false })
         .order('thang', { ascending: false })
         .order('thu_tu_hien_thi', { ascending: true, nullsFirst: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // "Chọn nhanh kỳ" ở trang xem: tìm cột theo (tháng, năm, loại) trực tiếp.
  // Trả về MẢNG vì riêng loại 'kh' một năm có thể nhiều cột (KH2027, KH2027_T7/2026…).
  async timCot(thang, nam, loai) {
    const { data, error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .select('*')
      .eq('thang', thang).eq('nam', nam).eq('loai', loai)
      .order('ma_cot');
    if (error) throw error;
    return data || [];
  },

  // Thêm cột mới. KHÔNG gửi id (identity tự sinh); ma_cot/tieu_de sinh sẵn
  // bằng UTILS.sinhMaCot / UTILS.sinhTieuDe trước khi gọi. Trả về dòng vừa tạo
  // (có id) để thêm ngay vào giao diện.
  async themCot(row) {
    const { data, error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async capNhatCot(cotId, row) {
    const { error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .update(row).eq('id', cotId);
    if (error) throw error;
  },

  // Xóa cột: so_lieu FK ON DELETE CASCADE → số liệu của cột bị xóa theo.
  // Giao diện PHẢI xacNhan() rõ ràng trước khi gọi.
  async xoaCot(cotId) {
    const { error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .delete().eq('id', cotId);
    if (error) throw error;
  },

  async luuDoRongCot(cotId, doRong) {
    const { error } = await sb
      .from(CONFIG.BANG.COT_BAO_CAO)
      .update({ do_rong_cot: doRong })
      .eq('id', cotId);
    if (error) throw error;
  },

  // ── CỘT SO SÁNH (cau_hinh_so_sanh) ─────────────────────
  // V2: Cột A (cot_tu) ÷ Cột B (cot_mau) × 100% — id của cot_bao_cao
  async laySoSanh(chiHienThi = false) {
    let q = sb.from(CONFIG.BANG.SO_SANH).select('*')
      .order('thu_tu', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    if (chiHienThi) q = q.eq('hien_thi', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async themSoSanh(row) {
    const { error } = await sb.from(CONFIG.BANG.SO_SANH).insert(row);
    if (error) throw error;
  },

  async suaSoSanh(id, row) {
    const { error } = await sb.from(CONFIG.BANG.SO_SANH).update(row).eq('id', id);
    if (error) throw error;
  },

  async xoaSoSanh(id) {
    const { error } = await sb.from(CONFIG.BANG.SO_SANH).delete().eq('id', id);
    if (error) throw error;
  },

  // ── CHỈ TIÊU ───────────────────────────────────────────
  async layChiTieuTheoBang(maBang) {
    const { data, error } = await sb
      .from(CONFIG.BANG.CHI_TIEU)
      .select('id, chi_tieu, don_vi, bang, thu_tu, la_tieu_de, cho_phep_nhap, kieu_du_lieu, stt_hien_thi, tan_suat, id_bo, do_rong_cot')
      .eq('bang', maBang)
      .order('thu_tu');
    if (error) throw error;
    return data || [];
  },

  async themChiTieu(row) {
    const { error } = await sb.from(CONFIG.BANG.CHI_TIEU).insert(row);
    if (error) throw error;
  },

  async capNhatChiTieu(id, row) {
    const { error } = await sb
      .from(CONFIG.BANG.CHI_TIEU)
      .update(row).eq('id', id);
    if (error) throw error;
  },

  // Xóa chỉ tiêu: so_lieu FK ON DELETE CASCADE → số liệu chỉ tiêu bị xóa theo.
  // Giao diện PHẢI xacNhan() trước khi gọi.
  async xoaChiTieu(id) {
    const { error } = await sb.from(CONFIG.BANG.CHI_TIEU).delete().eq('id', id);
    if (error) throw error;
  },

  // Lưu độ rộng nhiều chỉ tiêu cùng lúc (sau khi kéo thả)
  async luuDoRongChiTieu(dsDoRong) {
    // dsDoRong = [{ id, do_rong_cot }, ...]
    const promises = dsDoRong.map(r =>
      sb.from(CONFIG.BANG.CHI_TIEU)
        .update({ do_rong_cot: r.do_rong_cot })
        .eq('id', r.id)
    );
    const results = await Promise.all(promises);
    const err = results.find(r => r.error);
    if (err) throw err.error;
  },

  // ── SỐ LIỆU (so_lieu — bảng sự kiện duy nhất) ──────────
  // Lấy số liệu một bảng báo cáo theo danh sách cột.
  // Lọc theo bảng bằng inner join sang chi_tieu (so_lieu không có cột bang).
  async layDuLieu(maBang, dsCotId) {
    let q = sb
      .from(CONFIG.BANG.SO_LIEU)
      .select('id_chi_tieu, cot_id, gia_tri, gia_tri_text, ghi_chu, nguon_so_lieu, nguoi_nhap, thoi_gian_nhap, chi_tieu!inner(bang)')
      .eq('chi_tieu.bang', maBang);
    if (dsCotId && dsCotId.length) q = q.in('cot_id', dsCotId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // Upsert số liệu (một ô = { id_chi_tieu, cot_id, gia_tri | gia_tri_text,
  // ghi_chu?, nguon_so_lieu? }). Tự gắn nguoi_nhap = uuid đang đăng nhập và
  // thoi_gian_nhap = bây giờ (khác V1 — nguoi_nhap là uuid thật, không phải tên).
  // RLS duoc_ghi_o() chặn ghi sai bảng phân quyền / cột đã khóa.
  async luuDuLieu(rows) {
    if (!rows || !rows.length) return;
    const { data: { user } } = await sb.auth.getUser();
    const uid = user ? user.id : null;
    const luc = new Date().toISOString();
    const ds = rows.map(r => ({
      ...r,
      nguoi_nhap:     r.nguoi_nhap     || uid,
      thoi_gian_nhap: r.thoi_gian_nhap || luc,
    }));
    const { error } = await sb
      .from(CONFIG.BANG.SO_LIEU)
      .upsert(ds, { onConflict: 'id_chi_tieu,cot_id' });
    if (error) throw error;
  },

  // ── GỬI BÁO CÁO / ĐỀ NGHỊ MỞ KHÓA (05_gui_bao_cao_mo_khoa.sql) ──
  // Đơn vị tự khóa ĐÚNG bảng mình được phân quyền (RLS chi_tieu chỉ admin
  // ghi trực tiếp được — hàm RPC này tự kiểm tra quyền bên trong, bypass
  // có kiểm soát). Trả về số chỉ tiêu vừa bị khóa.
  async guiBaoCao(maBang) {
    const { data, error } = await sb.rpc('gui_bao_cao', { p_bang: maBang });
    if (error) throw error;
    return data;
  },

  // Đơn vị đề nghị mở khóa lại (không tự mở — chỉ ghi 1 yêu cầu chờ admin
  // duyệt ở Bước 6b). Trả về id yêu cầu vừa tạo.
  async deNghiMoKhoa(maBang, lyDo = '') {
    const { data, error } = await sb.rpc('de_nghi_mo_khoa', { p_bang: maBang, p_ly_do: lyDo || null });
    if (error) throw error;
    return data;
  },

  // Yêu cầu mở khóa GẦN NHẤT của một bảng (để hiển thị trạng thái
  // "đang chờ duyệt" / "đã bị từ chối, gửi lại được" trên giao diện).
  // Trả về null nếu bảng này chưa từng đề nghị.
  async layYeuCauMoKhoaGanNhat(maBang) {
    const { data, error } = await sb
      .from('yeu_cau_mo_khoa')
      .select('*')
      .eq('bang', maBang)
      .order('tao_luc', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Admin duyệt yêu cầu (Bước 6b sẽ có giao diện gọi hàm này).
  async duyetMoKhoa(id, dongY) {
    const { error } = await sb.rpc('duyet_mo_khoa', { p_id: id, p_dong_y: dongY });
    if (error) throw error;
  },

  // ── GOOGLE SHEET (danh_sach_gsheet) ────────────────────
  async layGSheet(chiHienThi = true) {
    let q = sb.from(CONFIG.BANG.GSHEET).select('*')
      .order('thu_tu', { ascending: true });
    if (chiHienThi) q = q.eq('hien_thi', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async themGSheet(row) {
    const { error } = await sb.from(CONFIG.BANG.GSHEET).insert(row);
    if (error) throw error;
  },

  async suaGSheet(id, row) {
    const { error } = await sb.from(CONFIG.BANG.GSHEET).update(row).eq('id', id);
    if (error) throw error;
  },

  async xoaGSheet(id) {
    const { error } = await sb.from(CONFIG.BANG.GSHEET).delete().eq('id', id);
    if (error) throw error;
  },

  // ── PHÂN QUYỀN (phan_quyen_bang — khóa theo uuid) ──────
  async layPhanQuyen(userId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .select('bang').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(r => r.bang);
  },

  async layTatCaPhanQuyen() {
    const { data, error } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .select('*');
    if (error) throw error;
    return data || [];
  },

  // Ghi đè toàn bộ phân quyền một user (xóa cũ → chèn mới) — chỉ admin.
  async luuPhanQuyen(userId, dsBang) {
    const { error: eXoa } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .delete().eq('user_id', userId);
    if (eXoa) throw eXoa;
    if (dsBang && dsBang.length) {
      const { error } = await sb
        .from(CONFIG.BANG.PHAN_QUYEN_BANG)
        .insert(dsBang.map(mb => ({ user_id: userId, bang: mb })));
      if (error) throw error;
    }
  },
};
