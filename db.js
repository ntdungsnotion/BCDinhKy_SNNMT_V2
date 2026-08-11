// ============================================================
// DB.JS — TẤT CẢ HÀM TRUY VẤN SUPABASE
// Yêu cầu: config.js phải được load trước
// ============================================================

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const DB = {

  // ── TÀI KHOẢN ──────────────────────────────────────────
  async layDanhSachTaiKhoan() {
    const { data, error } = await sb
      .from(CONFIG.BANG.TAI_KHOAN)
      .select('id, ho_ten, don_vi, vai_tro, mat_khau, trang_thai')
      .eq('trang_thai', true)
      .order('vai_tro').order('don_vi');
    if (error) throw error;
    return data || [];
  },

  async layTatCaTaiKhoan() {
    const { data, error } = await sb
      .from(CONFIG.BANG.TAI_KHOAN)
      .select('*')
      .neq('an_khoi_admin', true)
      .order('vai_tro').order('don_vi');
    if (error) throw error;
    return data || [];
  },

  async layTaiKhoanDayDu(id) {
    const { data, error } = await sb
      .from(CONFIG.BANG.TAI_KHOAN)
      .select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async doiMatKhau(id, matKhauMoi) {
    const { error } = await sb
      .from(CONFIG.BANG.TAI_KHOAN)
      .update({ mat_khau: matKhauMoi }).eq('id', id);
    if (error) throw error;
  },

  async themTaiKhoan(row) {
    const { error } = await sb.from(CONFIG.BANG.TAI_KHOAN).insert(row);
    if (error) throw error;
  },

  async suaTaiKhoan(id, row) {
    const { error } = await sb.from(CONFIG.BANG.TAI_KHOAN).update(row).eq('id', id);
    if (error) throw error;
  },

  async xoaTaiKhoan(id) {
    const { error } = await sb.from(CONFIG.BANG.TAI_KHOAN).delete().eq('id', id);
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

  async layBangDuocPhep(taiKhoanId) {
    const { data: pq, error } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .select('bang').eq('tai_khoan_id', taiKhoanId);
    if (error) throw error;
    const maBangs = (pq || []).map(r => r.bang);
    if (!maBangs.length) return [];
    const { data, error: e2 } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .select('*').in('bang', maBangs).order('thu_tu');
    if (e2) throw e2;
    return data || [];
  },

  async capNhatBang(maBang, row) {
    const { error } = await sb
      .from(CONFIG.BANG.DANH_SACH_BANG)
      .update(row).eq('bang', maBang);
    if (error) throw error;
  },

  // ── KỲ BÁO CÁO ─────────────────────────────────────────
  async layKyHienThi() {
    const { data, error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .select('*')
      .eq('dua_vao_bieu_bao_cao', true)
      .order('thu_tu_hien_thi', { ascending: true, nullsFirst: false })
      .order('nam_bao_cao', { ascending: false })
      .order('thang_bao_cao', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async layTatCaKy(namBatDau, namKetThuc) {
    let q = sb.from(CONFIG.BANG.KY_BAO_CAO).select('*');
    if (namBatDau) q = q.gte('nam_bao_cao', namBatDau);
    if (namKetThuc) q = q.lte('nam_bao_cao', namKetThuc);
    q = q.order('nam_bao_cao', { ascending: false })
         .order('thang_bao_cao', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async themKy(row) {
    const { error } = await sb.from(CONFIG.BANG.KY_BAO_CAO).insert(row);
    if (error) throw error;
  },

  async capNhatKy(maKy, row) {
    const { error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .update(row).eq('ky_bao_cao', maKy);
    if (error) throw error;
  },

  async xoaKy(maKy) {
    const { error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .delete().eq('ky_bao_cao', maKy);
    if (error) throw error;
  },

  // ── CỘT SO SÁNH (cau_hinh_so_sanh) ─────────────────────
  // Cột so sánh trong bảng nhập liệu = Kỳ A (ky_tu) ÷ Kỳ B (ky_mau) × 100%
  async laySoSanh(chiHienThi = false) {
    if (!CONFIG.BANG.SO_SANH) return [];
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

  // ── CÔNG THỨC CHỈ TIÊU TỔNG (cong_thuc_chi_tieu) ───────
  // Ô có công thức bị khóa nhập tay; giá trị do CT (congthuc.js) tính.
  // Nếu chưa chạy sql_cong_thuc_chi_tieu.sql thì trả về [] để ứng dụng
  // vẫn chạy bình thường như khi không có tính năng này.
  async layCongThuc(maBang = null) {
    if (!CONFIG.BANG.CONG_THUC) return [];
    let q = sb.from(CONFIG.BANG.CONG_THUC).select('*').order('id_chi_tieu');
    if (maBang) q = q.eq('bang', maBang);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async themCongThuc(row) {
    const { error } = await sb.from(CONFIG.BANG.CONG_THUC).insert(row);
    if (error) throw error;
  },

  async suaCongThuc(id, row) {
    const { error } = await sb.from(CONFIG.BANG.CONG_THUC).update(row).eq('id', id);
    if (error) throw error;
  },

  async xoaCongThuc(id) {
    const { error } = await sb.from(CONFIG.BANG.CONG_THUC).delete().eq('id', id);
    if (error) throw error;
  },

  // ── CHỈ TIÊU ───────────────────────────────────────────
  async layChiTieuTheoBang(maBang) {
    const { data, error } = await sb
      .from(CONFIG.BANG.CHI_TIEU)
      .select('id, chi_tieu, don_vi, bang, thu_tu, la_tieu_de, cho_phep_nhap, kieu_du_lieu, stt_hien_thi, tan_suat, id_bo')
      .eq('bang', maBang)
      .order('thu_tu');
    if (error) throw error;
    return data || [];
  },

  async capNhatChiTieu(id, row) {
    const { error } = await sb
      .from(CONFIG.BANG.CHI_TIEU)
      .update(row).eq('id', id);
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

  // Lưu độ rộng cột kỳ báo cáo
  async luuDoRongKy(maKy, doRong) {
    const { error } = await sb
      .from(CONFIG.BANG.KY_BAO_CAO)
      .update({ do_rong_cot: doRong })
      .eq('ky_bao_cao', maKy);
    if (error) throw error;
  },

  // ── DỮ LIỆU NHẬP ───────────────────────────────────────
  // PostgreSQL tự chuyển tên bảng thành chữ thường khi tạo
  // 'csdl_' + 'Bang_01' → toLowerCase() → 'csdl_bang_01' ✅
  _tenBangCSDL(maBang) {
    return (CONFIG.BANG.CSDL_PREFIX + maBang).toLowerCase();
  },

  async layDuLieu(maBang, dsKy) {
    const { data, error } = await sb
      .from(this._tenBangCSDL(maBang))
      .select('*')
      .in('ky_bao_cao', dsKy);
    if (error) throw error;
    return data || [];
  },

  async luuDuLieu(maBang, rows) {
    const { error } = await sb
      .from(this._tenBangCSDL(maBang))
      .upsert(rows, { onConflict: 'id_chi_tieu,ky_bao_cao' });
    if (error) throw error;
  },

  // ── GOOGLE SHEET (danh_sach_gsheet) ────────────────────
  // Lưu ý: dùng biến `sb` cục bộ (bản cũ gọi DB.sb — không tồn tại — nên luôn lỗi)
  async layGSheet(chiHienThi = true) {
    if (!CONFIG.BANG.GSHEET) return [];
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

  // ── PHÂN QUYỀN ─────────────────────────────────────────
  async layPhanQuyen(taiKhoanId) {
    const { data, error } = await sb
      .from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .select('bang').eq('tai_khoan_id', taiKhoanId);
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

  async luuPhanQuyen(taiKhoanId, dsBang) {
    await sb.from(CONFIG.BANG.PHAN_QUYEN_BANG)
      .delete().eq('tai_khoan_id', taiKhoanId);
    if (dsBang.length) {
      const { error } = await sb.from(CONFIG.BANG.PHAN_QUYEN_BANG)
        .insert(dsBang.map(mb => ({ tai_khoan_id: taiKhoanId, bang: mb })));
      if (error) throw error;
    }
  },
};
