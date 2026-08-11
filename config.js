// ============================================================
// CONFIG.JS — CẤU HÌNH HỆ THỐNG
// ⚠️  FILE NHẠY CẢM — không chia sẻ công khai
// Khi deploy: đặt file này ngoài thư mục public hoặc
// dùng biến môi trường nếu có server
// ============================================================

const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://tztigowjdbfzalcsyoqj.supabase.co',
  SUPABASE_KEY: 'sb_publishable_jarPut6H_Di8m8M7HNiCpQ_EDBTLXOk',

  // Hệ thống
  TEN_HE_THONG:  'Báo cáo số liệu định kỳ tháng, quý, năm',
  TEN_CO_QUAN:   'hoạt động ngành Nông nghiệp và Môi trường',
  MAT_KHAU_MAC_DINH: 'snnmt',

  // Tên bảng DB
  BANG: {
    DANH_SACH_BANG:  'danh_sach_bang',
    CHI_TIEU:        'chi_tieu',
    KY_BAO_CAO:      'ky_bao_cao',
    TAI_KHOAN:       'tai_khoan',
    PHAN_QUYEN_BANG: 'phan_quyen_bang',
    SO_SANH:         'cau_hinh_so_sanh',   // cấu hình cột so sánh (Kỳ A ÷ Kỳ B × 100%)
    CONG_THUC:       'cong_thuc_chi_tieu',  // công thức chỉ tiêu tổng (chạy sql_cong_thuc_chi_tieu.sql)
    GSHEET:          'danh_sach_gsheet',    // danh sách Google Sheet nhúng
    CSDL_PREFIX:     'csdl_',   // + maBang.toLowerCase() → csdl_bang_01, csdl_bang_02...
  },
};

// Danh sách các tập tin google sheet nếu muốn cho chỉnh sửa: 'Mã bảng': 'https://docs.google.com/spreadsheets/d/ID_FILE_gSheet/edit?rm=minimal'
// hoặc url xuất bản web nếu muốn chỉ cho xem: 'Mã bảng': 'url xuất bản web' url này lấy như sau:
// 1. Vào menu Tệp (File) -> Chia sẻ (Share) -> Xuất bản lên web (Publish to web).
// 2. Tại cửa sổ hiện ra, chọn tab Nhúng (Embed).
// 3. Nhấn nút Xuất bản (Publish).
// 4. Copy đoạn link trong ô đó (chỉ copy phần bắt đầu từ https://... đến hết dấu hỏi hoặc mã cuối cùng, không copy cả đoạn <iframe...).
//(Bạn có thể thêm không giới hạn dòng ở đây)
CONFIG.GANTT_SOURCES = {
  'GANTT_TIEN_DO': 'https://docs.google.com/spreadsheets/d/1RyZFtV-rXnRT9hbS8xd2pMuUKD8CBDiPz9rUKlOINgk/htmlembed?widget=true&headers=false',
  'GANTT_DU_AN_2': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIqh2EbWCVMI0FX-THKaOnGpbgwWd7SwgLkgsKUYkqif1ZTaL29lMqY1dWmSSU-lOArab1Ud7oP-PE/pubhtml?gid=0&single=true',
  'GANTT_NNDT': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ0ui-TDjUSvXg8TJ1jTjSqVWlRVuILghNdVAHrIZXteH-jlRq3JWtYIfuPGXtiM839e_tR2p1pRc6/pubhtml'
};
