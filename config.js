// Phiên bản ứng dụng: V2 — nâng cấp bảo mật
// Phiên bản file: Bước 6d — config.js, cập nhật 2026/07/25 14:04 (GMT+7)
// ============================================================
// CONFIG.JS — V2 (project Supabase MỚI, độc lập hoàn toàn với V1)
// Publishable key AN TOÀN để đặt trong frontend — RLS mới là
// lớp bảo vệ thật (đã dựng đầy đủ ở Bước 3, 16/16 kịch bản đạt).
// Thứ tự load trong HTML:
//   supabase-js v2 (CDN) → config.js → db.js → utils.js
// ============================================================

const CONFIG = {
  SUPABASE_URL: 'https://fnxiylqyfumpkwcznldo.supabase.co',
  SUPABASE_KEY: 'sb_publishable_o2pTGCmUcBtBb1S6kLBcXw_tP5fsiVH',

  TEN_HE_THONG: 'Báo cáo định kỳ tháng, quý, năm...',
  TEN_CO_QUAN:  'Sở Nông nghiệp và Môi trường',

  // Tên bảng theo schema V2 (01_tao_schema.sql).
  // Khác V1: KHÔNG còn TAI_KHOAN (thay bằng Supabase Auth + HO_SO),
  // KHÔNG còn KY_BAO_CAO (thay bằng COT_BAO_CAO = kỳ × loại),
  // KHÔNG còn CSDL_PREFIX (22 bảng csdl_bang_xx gộp thành SO_LIEU).
  BANG: {
    DANH_SACH_BANG:  'danh_sach_bang',
    CHI_TIEU:        'chi_tieu',
    LOAI_SO_LIEU:    'dm_loai_so_lieu',
    COT_BAO_CAO:     'cot_bao_cao',
    SO_LIEU:         'so_lieu',
    HO_SO:           'ho_so',
    PHAN_QUYEN_BANG: 'phan_quyen_bang',    // NGƯNG DÙNG từ Bước 6c — giữ tạm, xem DON_VI/QUYEN_DOC_BANG
    GSHEET:          'danh_sach_gsheet',
    SO_SANH:         'cau_hinh_so_sanh',
    DON_VI:          'don_vi',             // MỚI Bước 6c: đơn vị/phòng ban
    QUYEN_DOC_BANG:  'quyen_doc_bang',      // MỚI Bước 6c: quyền đọc bổ sung (đơn vị × bảng)
    LICH_SU_SO_LIEU: 'lich_su_so_lieu',     // MỚI Bước 6c: nhật ký sửa số liệu
  },
};
