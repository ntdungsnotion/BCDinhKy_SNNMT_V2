// Phiên bản ứng dụng: V2 — nâng cấp bảo mật
// Phiên bản file: Bước 8b — db.js, cập nhật 2026/07/27 10:14 (GMT+7)
//   Bước 8b: thêm trọn khối "KỲ BÁO CÁO" (Bước 8/8a-vá) — bọc 7 RPC gốc +
//            10 RPC/bảng mới của 8a-vá + RPC dat_phai_bao_cao (bổ sung ngoài
//            phạm vi 8a-vá gốc, xem 12_dat_phai_bao_cao.sql); layChiTieuTheoBang
//            lấy thêm thang_tuy_chinh/nam_dac_biet cho UTILS.apDungTanSuat.
//   Bước 7a: thêm datTrangThaiTaiKhoan() — khoá/mở khoá đồng bộ 2 lớp
//            (auth banned_until + ho_so.trang_thai) qua RPC dat_trang_thai_tai_khoan;
//            thêm dsDonViChonNhanh() — picker "chọn nhanh đơn vị" đọc động (anon).
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
      don_vi_id: hoSo.don_vi_id ?? null,             // MỚI Bước 6c/6d: nguồn sự thật phân quyền
      vai_tro: hoSo.vai_tro,
      phai_doi_mat_khau: !!hoSo.phai_doi_mat_khau,   // MỚI Bước 6c/6d: buộc đổi MK lần đăng nhập kế
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
      don_vi_id: hoSo.don_vi_id ?? null,
      vai_tro: hoSo.vai_tro,
      phai_doi_mat_khau: !!hoSo.phai_doi_mat_khau,
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

  // Tự đổi mật khẩu của CHÍNH MÌNH — BẢN MỚI Bước 6c/6d: gọi RPC
  // doi_mat_khau_cua_toi() thay vì sb.auth.updateUser() trực tiếp, vì RPC
  // đổi mật khẩu VÀ tắt cờ ho_so.phai_doi_mat_khau CÙNG một giao dịch (tránh
  // trường hợp đổi được mật khẩu mà cờ bắt đổi vẫn còn bật ở lần đăng nhập
  // sau). Đặt lại mật khẩu cho NGƯỜI KHÁC dùng DB.datLaiMatKhau (chỉ admin
  // toàn quyền) — xem 06_don_vi_va_quan_tri_tai_khoan.sql PHẦN 7.
  async doiMatKhauCuaToi(matKhauMoi) {
    const { error } = await sb.rpc('doi_mat_khau_cua_toi', { p_mat_khau: matKhauMoi });
    if (error) throw error;
  },

  // Theo dõi biến động phiên (đăng nhập/đăng xuất/hết hạn) — dùng ở Bước 5
  // để tự quay về màn đăng nhập khi phiên hết hạn.
  onAuthChange(callback) {
    return sb.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  // Tạo tài khoản mới — BẢN MỚI Bước 6c/6d: gọi RPC tao_tai_khoan() thay vì
  // sb.auth.signUp() trên client phụ (cách cũ Bước 6b). Lý do đổi:
  //   1) RPC gán được don_vi_id VÀ vai_tro (kể cả 'admin_han_che') ngay khi
  //      tạo — signUp chỉ ghi metadata, phải sửa lại ho_so sau.
  //   2) Không cần bật "Confirm email TẮT" trên Dashboard.
  //   3) RPC tự kiểm la_admin_toan_quyen() bên trong (07_hai_loai_admin...sql)
  //      — admin_han_che gọi sẽ bị chặn ngay ở CSDL, không chỉ ở UI.
  // Trả về uuid tài khoản vừa tạo (không phải object user đầy đủ như signUp).
  async taoTaiKhoan(email, matKhau, { don_vi_id = null, ho_ten = '', vai_tro = 'editor' } = {}) {
    const { data, error } = await sb.rpc('tao_tai_khoan', {
      p_email: String(email || '').trim().toLowerCase(),
      p_mat_khau: matKhau,
      p_ho_ten: ho_ten || null,
      p_don_vi_id: don_vi_id,
      p_vai_tro: vai_tro,
    });
    if (error) throw error;
    return data;      // uuid
  },

  // Đặt lại mật khẩu cho NGƯỜI KHÁC — chỉ admin toàn quyền (RPC tự kiểm).
  // Bật cờ phai_doi_mat_khau + huỷ phiên cũ của người đó (xem file 06 PHẦN 7.3).
  async datLaiMatKhau(userId, matKhauMoi) {
    const { error } = await sb.rpc('dat_lai_mat_khau', { p_user_id: userId, p_mat_khau: matKhauMoi });
    if (error) throw error;
  },

  // Khoá / mở khoá tài khoản — BẢN MỚI Bước 7a. Trước đây trang Tài khoản chỉ
  // lật ho_so.trang_thai (suaHoSo), KHÔNG đụng auth.users.banned_until, nên
  // "mở lại" một tài khoản đang bị ban ở lớp Auth vẫn báo "User is banned".
  // RPC dat_trang_thai_tai_khoan() đồng bộ CẢ HAI lớp trong một giao dịch và
  // tự kiểm la_admin_toan_quyen() bên trong (08_khoa_mo_tai_khoan.sql).
  //   hoatDong = true  → gỡ ban + trang_thai = true
  //   hoatDong = false → ban + trang_thai = false + huỷ phiên đang mở
  async datTrangThaiTaiKhoan(userId, hoatDong) {
    const { error } = await sb.rpc('dat_trang_thai_tai_khoan', {
      p_user_id: userId, p_hoat_dong: !!hoatDong,
    });
    if (error) throw error;
  },

  // Danh sách tài khoản KÈM EMAIL — thay layTatCaHoSo() ở trang Tài khoản
  // (Bước 6b không hiện được email; Bước 6c thêm RPC ds_tai_khoan() SECURITY
  // DEFINER để đọc auth.users hợp lệ, chỉ admin gọi được — xem file 06 PHẦN 7.1).
  async dsTaiKhoanDayDu() {
    const { data, error } = await sb.rpc('ds_tai_khoan');
    if (error) throw error;
    return data || [];
  },

  // Danh sách "chọn nhanh đơn vị" ở trang đăng nhập — BẢN MỚI Bước 7a: đọc ĐỘNG
  // từ DB qua RPC ds_don_vi_chon_nhanh() (anon gọi được, chỉ trả tài khoản đang
  // hoạt động + đơn vị chưa ngưng). Thay danh sách TĨNH cũ trong index.html vốn
  // bị trôi khi Sở gộp/tách đơn vị. Không đăng nhập được vẫn gọi được (anon).
  async dsDonViChonNhanh() {
    const { data, error } = await sb.rpc('ds_don_vi_chon_nhanh');
    if (error) throw error;
    return data || [];
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

  // ── ĐƠN VỊ (don_vi — MỚI Bước 6c/6d) ────────────────────
  // Đọc: mọi người đã đăng nhập (RLS don_vi_doc). Ghi: chỉ admin.
  async layTatCaDonVi() {
    const { data, error } = await sb
      .from(CONFIG.BANG.DON_VI)
      .select('*').order('thu_tu', { ascending: true, nullsFirst: false }).order('ten');
    if (error) throw error;
    return data || [];
  },

  async themDonVi(row) {
    const { data, error } = await sb.from(CONFIG.BANG.DON_VI).insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async suaDonVi(id, row) {
    const { error } = await sb.from(CONFIG.BANG.DON_VI).update(row).eq('id', id);
    if (error) throw error;
  },

  // Xoá đơn vị: chặn ở CSDL nếu là admin_han_che (policy RESTRICTIVE Bước 6c
  // phần 07); ho_so.don_vi_id / danh_sach_bang.don_vi_nhap_id là ON DELETE
  // SET NULL nên xoá đơn vị không mất tài khoản/bảng, chỉ gỡ liên kết.
  async xoaDonVi(id) {
    const { error } = await sb.from(CONFIG.BANG.DON_VI).delete().eq('id', id);
    if (error) throw error;
  },

  // Bảng do MỘT đơn vị chịu trách nhiệm NHẬP (danh_sach_bang.don_vi_nhap_id).
  // Dùng ở index.html cho editor: chỉ thấy đúng bảng đơn vị mình nhập.
  async layBangDuocNhap(donViId) {
    if (!donViId) return [];
    const { data, error } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .select('*').eq('don_vi_nhap_id', donViId).order('thu_tu');
    if (error) throw error;
    return data || [];
  },

  // Quyền ĐỌC bổ sung (đơn vị × bảng) — TOÀN BỘ bảng ghép (admin quản trị).
  async layTatCaQuyenDocBang() {
    const { data, error } = await sb.from(CONFIG.BANG.QUYEN_DOC_BANG).select('*');
    if (error) throw error;
    return data || [];
  },

  // Danh sách MÃ BẢNG một đơn vị được cấp quyền đọc THÊM (không tính bảng
  // mình nhập — bảng đó luôn đọc được, không cần dòng nào ở quyen_doc_bang).
  async layQuyenDocBangCuaDonVi(donViId) {
    if (!donViId) return [];
    const { data, error } = await sb
      .from(CONFIG.BANG.QUYEN_DOC_BANG)
      .select('bang').eq('don_vi_id', donViId);
    if (error) throw error;
    return (data || []).map(r => r.bang);
  },

  // Bảng đơn vị được XEM (nhập + được cấp thêm) — dùng ở xembaocao.html.
  // Gộp 2 nguồn rồi khử trùng bằng UTILS.gopBangDuocXem (hàm thuần, có test).
  async layBangDuocXem(donViId) {
    if (!donViId) return [];
    const [dsBangAll, dsQuyen] = await Promise.all([
      this.layTatCaBang(),
      this.layQuyenDocBangCuaDonVi(donViId),
    ]);
    return UTILS.gopBangDuocXem(dsBangAll, donViId, dsQuyen);
  },

  // Ghi đè toàn bộ quyền đọc BỔ SUNG của một đơn vị (xoá cũ → chèn mới) —
  // chỉ admin. Không đụng bảng đơn vị đó đang nhập (không cần dòng riêng).
  async luuQuyenDocBang(donViId, dsMaBang) {
    const { error: eXoa } = await sb
      .from(CONFIG.BANG.QUYEN_DOC_BANG)
      .delete().eq('don_vi_id', donViId);
    if (eXoa) throw eXoa;
    if (dsMaBang && dsMaBang.length) {
      const { error } = await sb
        .from(CONFIG.BANG.QUYEN_DOC_BANG)
        .insert(dsMaBang.map(mb => ({ don_vi_id: donViId, bang: mb })));
      if (error) throw error;
    }
  },

  // ── NHẬT KÝ SỬA SỐ LIỆU (lich_su_so_lieu — MỚI Bước 6c/6d) ─
  // Đọc theo đúng quyền đọc số liệu (RLS lich_su_doc); không ai ghi trực
  // tiếp được (chỉ trigger). loc = { bang?, idChiTieu?, cotId?, gioiHan? }
  async layLichSuSoLieu(loc = {}) {
    let q = sb.from(CONFIG.BANG.LICH_SU_SO_LIEU).select('*');
    if (loc.bang)       q = q.eq('bang', loc.bang);
    if (loc.idChiTieu)  q = q.eq('id_chi_tieu', loc.idChiTieu);
    if (loc.cotId)      q = q.eq('cot_id', loc.cotId);
    q = q.order('thoi_diem', { ascending: false }).limit(loc.gioiHan || 100);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
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
      .select('id, chi_tieu, don_vi, bang, thu_tu, la_tieu_de, cho_phep_nhap, kieu_du_lieu, stt_hien_thi, tan_suat, thang_tuy_chinh, nam_dac_biet, id_bo, do_rong_cot')
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
  // ghi_chu?, nguon_so_lieu?, ly_do_sua? }). Tự gắn nguoi_nhap = uuid đang
  // đăng nhập và thoi_gian_nhap = bây giờ (khác V1 — nguoi_nhap là uuid thật,
  // không phải tên). RLS duoc_ghi_o() chặn ghi sai bảng phân quyền / cột đã khóa.
  // ly_do_sua (MỚI Bước 6c/6d): cột "đi nhờ" — trigger chép sang
  // lich_su_so_lieu rồi tự xoá khỏi so_lieu; giao diện chỉ gửi khi admin sửa
  // số liệu của đơn vị khác (xem UTILS.canHoiLyDoSua).
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

  // ════════════════════════════════════════════════════════════
  // KỲ BÁO CÁO (Bước 8 / 8a-vá / 8b) — lớp nghiệp vụ đứng TRÊN mô hình 3
  // chiều (chỉ tiêu × cột × loại). "Kỳ báo cáo" (bảng ky_bao_cao) khác hẳn
  // "kỳ dữ liệu" (cot_bao_cao — không đổi, xem khối CỘT BÁO CÁO ở trên).
  // Bảy RPC gốc của 8a GIỮ NGUYÊN chữ ký qua bản vá 8a-vá:
  //   tao_ky_bao_cao, dat_han_nop, nop_bao_cao, de_nghi_chinh_sua,
  //   duyet_mo_lai_bao_cao, tien_do_dot, _tim_hoac_tao_cot (nội bộ, không gọi
  //   trực tiếp từ đây).
  // ════════════════════════════════════════════════════════════

  // Danh sách kỳ báo cáo (mọi trạng thái — dùng cho trang quản trị).
  // loc = { nam?, thang? } — lọc đúng (không phải khoảng, vì kỳ báo cáo ít,
  // không cần khoảng năm như cot_bao_cao). Sắp tao_luc GIẢM DẦN (đặc tả v4
  // mục 11 Luồng A1 — mới nhất trên).
  async layTatCaKyBaoCao(loc = {}) {
    let q = sb.from(CONFIG.BANG.KY_BAO_CAO).select('*');
    if (loc.nam)   q = q.eq('nam', loc.nam);
    if (loc.thang) q = q.eq('thang', loc.thang);
    q = q.order('tao_luc', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async layKyBaoCao(id) {
    const { data, error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  // Kỳ báo cáo đơn vị được PHÉP CHỌN ở index.html (đặc tả v4 mục 3.3 "Danh
  // sách kỳ để chọn"). Admin thấy MỌI kỳ đang mở (admin bypass mọi tầng khóa
  // nên không cần lọc theo phai_bao_cao). Đơn vị chỉ thấy kỳ mo có ít nhất
  // một biểu của mình đang phai_bao_cao=true.
  // isAdmin=false mà dsBangCuaDonVi rỗng → trả về mảng rỗng (chưa được phân
  // công bảng nào thì không có kỳ nào để chọn).
  async layDsKyDeChon(dsBangCuaDonVi, isAdmin) {
    if (isAdmin) {
      const { data, error } = await sb
        .from(CONFIG.BANG.KY_BAO_CAO)
        .select('*').eq('trang_thai_ky', 'mo')
        .order('tao_luc', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    if (!dsBangCuaDonVi || !dsBangCuaDonVi.length) return [];
    const { data, error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .select('*, trang_thai_nop!inner(bang,phai_bao_cao)')
      .eq('trang_thai_ky', 'mo')
      .eq('trang_thai_nop.phai_bao_cao', true)
      .in('trang_thai_nop.bang', dsBangCuaDonVi)
      .order('tao_luc', { ascending: false });
    if (error) throw error;
    // Khử trùng phòng hờ: mỗi kỳ chỉ nên xuất hiện MỘT lần dù có nhiều biểu
    // khớp điều kiện lọc embed ở trên (PostgREST không nhân bản dòng cha khi
    // embed, nhưng giữ khử trùng cho chắc — rẻ, không hại).
    const daThay = new Set();
    return (data || []).filter(k => {
      if (daThay.has(k.id)) return false;
      daThay.add(k.id); return true;
    });
  },

  // Tạo kỳ báo cáo mới (Luồng A1 bước "Xác nhận"). Trả về id kỳ vừa tạo.
  // Kỳ khởi tạo ở trạng thái 'nhap' (nháp) — đơn vị chưa thấy tới khi admin
  // "Phát hành" (xem suaKyBaoCao — chỉ là UPDATE trang_thai_ky='mo').
  async taoKyBaoCao(nam, loaiKy = 'thang', thang = null, ten = null, hanNop = null) {
    const { data, error } = await sb.rpc('tao_ky_bao_cao', {
      p_nam: nam, p_loai_ky: loaiKy, p_thang: thang, p_ten: ten, p_han_nop: hanNop,
    });
    if (error) throw error;
    return data;
  },

  // Sửa trực tiếp kỳ báo cáo (RLS admin ghi trực tiếp được — KHÔNG cần RPC).
  // Dùng cho: "Phát hành" ({trang_thai_ky:'mo'}), đóng kỳ ({trang_thai_ky:'dong'}),
  // sửa tên/hạn chung/thứ tự/ghi chú.
  async suaKyBaoCao(id, row) {
    const { error } = await sb.from(CONFIG.BANG.KY_BAO_CAO).update(row).eq('id', id);
    if (error) throw error;
  },

  // Xem trước (CHỈ ĐỌC) 5 cột mặc định của một kỳ CHƯA tạo — Luồng A1 bước 2.
  async duKienCotKy(thang, nam) {
    const { data, error } = await sb.rpc('du_kien_cot_ky', { p_thang: thang, p_nam: nam });
    if (error) throw error;
    return data || [];
  },

  // Kỳ dữ liệu (cột) THẬT SỰ thuộc một kỳ báo cáo đã tạo — dùng ở Luồng A2
  // (ngăn trên "Chọn kỳ báo cáo") và Luồng A1 bước 3 (xác nhận sau khi tạo).
  // Sắp theo COALESCE(ky_bao_cao_cot.thu_tu, cot_bao_cao.thu_tu_hien_thi) —
  // đúng công thức đặc tả v4 mục 4 (trình tự cột trong lưới nhập).
  async layCotCuaKy(kyId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO_COT)
      .select('thu_tu, cot_id, cot_bao_cao(*)')
      .eq('ky_id', kyId);
    if (error) throw error;
    return (data || [])
      .filter(r => r.cot_bao_cao)
      .map(r => ({ ...r.cot_bao_cao, thu_tu_trong_ky: r.thu_tu }))
      .sort((a, b) => (Number(a.thu_tu_trong_ky ?? a.thu_tu_hien_thi) || 0)
                     - (Number(b.thu_tu_trong_ky ?? b.thu_tu_hien_thi) || 0));
  },

  // Admin thêm MỘT kỳ dữ liệu (cột) vào kỳ báo cáo — cột đặc biệt (kế hoạch
  // năm, ước quý…) ở Luồng A1 bước 3, hoặc tuỳ chỉnh thêm ở Luồng A2. Tự tạo
  // cột nếu (tháng,năm,loại) chưa có (dùng chung _tim_hoac_tao_cot). Trả về cot_id.
  async themCotVaoKy(kyId, thang, nam, loai, thuTu = null) {
    const { data, error } = await sb.rpc('them_cot_vao_ky', {
      p_ky_id: kyId, p_thang: thang, p_nam: nam, p_loai: loai, p_thu_tu: thuTu,
    });
    if (error) throw error;
    return data;
  },

  // Admin bỏ một kỳ dữ liệu (cột) khỏi kỳ báo cáo (KHÔNG xoá cot_bao_cao/so_lieu).
  async boCotKhoiKy(kyId, cotId) {
    const { error } = await sb.rpc('bo_cot_khoi_ky', { p_ky_id: kyId, p_cot_id: cotId });
    if (error) throw error;
  },

  // Đặt hạn nộp. p_bang=null → hạn CHUNG cả kỳ; p_bang có giá trị → hạn RIÊNG
  // biểu đó (đè hạn chung). hanNop=null → GỠ hạn riêng / xoá hạn chung.
  async datHanNop(kyId, bang = null, hanNop = null) {
    const { error } = await sb.rpc('dat_han_nop', { p_ky_id: kyId, p_bang: bang, p_han_nop: hanNop });
    if (error) throw error;
  },

  async layHanNopBang(kyId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.HAN_NOP_BANG)
      .select('*').eq('ky_id', kyId);
    if (error) throw error;
    return data || [];
  },

  // Tính lại phai_bao_cao của mọi biểu trong kỳ (gọi sau khi thêm/bớt cột) —
  // CHỈ chạm dòng admin_sua_tay=false (không ghi đè chỗ admin đã sửa tay).
  // Trả về số dòng vừa cập nhật.
  async tinhLaiPhaiBaoCao(kyId) {
    const { data, error } = await sb.rpc('tinh_lai_phai_bao_cao', { p_ky_id: kyId });
    if (error) throw error;
    return data;
  },

  // Admin sửa TAY cờ phai_bao_cao của một (kỳ × biểu) — Luồng C mục 11 việc 3.
  // RPC MỚI ngoài phạm vi 8a-vá gốc (xem 12_dat_phai_bao_cao.sql) — trang_thai_nop
  // cố ý không có policy ghi trực tiếp cho authenticated. Luôn đặt admin_sua_tay=true
  // để tinh_lai_phai_bao_cao() không ghi đè lại lần sau.
  async datPhaiBaoCao(kyId, bang, phaiBaoCao) {
    const { error } = await sb.rpc('dat_phai_bao_cao', {
      p_ky_id: kyId, p_bang: bang, p_phai_bao_cao: !!phaiBaoCao,
    });
    if (error) throw error;
  },

  // Kỳ "đang thu thập" — cờ lưu thẳng (đặc tả v4 mục 3.3b), CHỈ dùng làm mặc
  // định ở ô chọn kỳ của đơn vị. Trả về id kỳ, hoặc null nếu chưa có kỳ nào mở.
  async kyDangThuThap() {
    const { data, error } = await sb.rpc('ky_dang_thu_thap');
    if (error) throw error;
    return data;
  },

  // Admin đặt kỳ đang thu thập (Luồng A2 tự gọi khi "Đồng ý" ngăn trên; trang
  // quản trị kỳ báo cáo cũng gọi được tay nếu thấy phần mềm đặt lệch).
  async datKyDangThuThap(kyId) {
    const { error } = await sb.rpc('dat_ky_dang_thu_thap', { p_ky_id: kyId });
    if (error) throw error;
  },

  // Đơn vị (hoặc admin thay mặt) NỘP báo cáo cho (kỳ × biểu) — thay hẳn
  // guiBaoCao() cũ (Bước 5, đã dọn khoá chéo tầng ở 8a-vá, xem đặc tả v4 mục 7).
  async nopBaoCao(kyId, bang) {
    const { error } = await sb.rpc('nop_bao_cao', { p_ky_id: kyId, p_bang: bang });
    if (error) throw error;
  },

  // Đơn vị đề nghị chỉnh sửa lại biểu ĐÃ NỘP — thay hẳn deNghiMoKhoa() cũ.
  async deNghiChinhSuaKy(kyId, bang, ghiChu = null) {
    const { error } = await sb.rpc('de_nghi_chinh_sua', {
      p_ky_id: kyId, p_bang: bang, p_ghi_chu: (ghiChu || '').trim() || null,
    });
    if (error) throw error;
  },

  // Admin duyệt (đồng ý → 'da_mo_lai') hoặc từ chối (→ trả lại 'da_nop') đề
  // nghị chỉnh sửa đang chờ.
  async duyetMoLaiBaoCao(kyId, bang, dongY) {
    const { error } = await sb.rpc('duyet_mo_lai_bao_cao', {
      p_ky_id: kyId, p_bang: bang, p_dong_y: !!dongY,
    });
    if (error) throw error;
  },

  // Admin CHỦ ĐỘNG trả lại biểu đã nộp (không cần đơn vị xin trước) — RPC MỚI
  // của 8a-vá, việc 10.
  async traLaiBaoCao(kyId, bang, lyDo = null) {
    const { error } = await sb.rpc('tra_lai_bao_cao', {
      p_ky_id: kyId, p_bang: bang, p_ly_do: (lyDo || '').trim() || null,
    });
    if (error) throw error;
  },

  // Tiến độ nộp của MỘT kỳ báo cáo — RLS tự lọc: đơn vị chỉ thấy biểu mình,
  // admin thấy hết. Đã lọc phai_bao_cao=true và sửa đúng "đang nhập" (8a-vá
  // lỗi 3). Giao diện Luồng C tự GOM theo don_vi_ten (KHÔNG đổi chữ ký RPC —
  // xem quyết định 8a-vá).
  async tienDoDot(kyId) {
    const { data, error } = await sb.rpc('tien_do_dot', { p_ky_id: kyId });
    if (error) throw error;
    return data || [];
  },

  // Vết nộp/xin sửa/duyệt/từ chối/trả lại của một (kỳ × biểu) — đơn vị đọc
  // được vết biểu MÌNH (RLS lich_su_nop_doc), admin đọc hết. Dùng để hiển thị
  // "lý do bị trả lại" ở index.html và lịch sử ở admin.html.
  async layLichSuNop(kyId, bang) {
    const { data, error } = await sb
      .from(CONFIG.BANG.LICH_SU_NOP)
      .select('*').eq('ky_id', kyId).eq('bang', bang)
      .order('luc', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Trạng thái nộp của MỘT (kỳ × biểu) cụ thể — dùng ở index.html (trang nhập)
  // để quyết định khoá lưới + nút Nộp/Đề nghị chỉnh sửa. RLS: đơn vị chỉ đọc
  // được biểu mình phụ trách (đã đủ, không cần thêm điều kiện ở đây).
  async layTrangThaiNopMotBieu(kyId, bang) {
    const { data, error } = await sb
      .from(CONFIG.BANG.TRANG_THAI_NOP)
      .select('*').eq('ky_id', kyId).eq('bang', bang).maybeSingle();
    if (error) throw error;
    return data;
  },

  // Toàn bộ dòng trang_thai_nop của MỘT kỳ báo cáo — KỂ CẢ phai_bao_cao=false
  // (khác tienDoDot() chỉ trả biểu đang phai_bao_cao=true, xem 11_va_ky_bao_cao.sql
  // Phần 13). Dùng cho panel "Quản lý phải báo cáo" (Luồng C việc 3) — admin cần
  // thấy CẢ những biểu đang bị loại để bật lại nếu thấy sai.
  async layTrangThaiNopTheoKy(kyId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.TRANG_THAI_NOP)
      .select('*, danh_sach_bang(ten_bang)')
      .eq('ky_id', kyId);
    if (error) throw error;
    return data || [];
  },

  // ── DANH MỤC TRẠNG THÁI NỘP (dm_trang_thai_nop) — admin quản lý tên/màu/
  // ngưỡng ngày, KHÔNG khoá cứng trong CHECK constraint (Bước 8 mục 1). ──
  async layDmTrangThaiNop() {
    const { data, error } = await sb
      .from(CONFIG.BANG.DM_TRANG_THAI_NOP)
      .select('*').order('nhom').order('thu_tu', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
  },

  async themDmTrangThaiNop(row) {
    const { error } = await sb.from(CONFIG.BANG.DM_TRANG_THAI_NOP).insert(row);
    if (error) throw error;
  },

  async suaDmTrangThaiNop(ma, row) {
    const { error } = await sb.from(CONFIG.BANG.DM_TRANG_THAI_NOP).update(row).eq('ma', ma);
    if (error) throw error;
  },

  async xoaDmTrangThaiNop(ma) {
    const { error } = await sb.from(CONFIG.BANG.DM_TRANG_THAI_NOP).delete().eq('ma', ma);
    if (error) throw error;
  },
};
