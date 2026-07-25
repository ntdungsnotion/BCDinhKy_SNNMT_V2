// Smoke test: tải THẬT admin.html qua jsdom, giả lập DB.* trả dữ liệu mẫu,
// rồi gọi qua các trang MỚI ở Bước 6d để bắt lỗi runtime (ReferenceError,
// TypeError...) mà node --check (chỉ kiểm cú pháp) không phát hiện được.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let loi = [];

const html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8')
  // Bỏ các <script src> nạp CDN/local — sẽ tự tiêm CONFIG/DB/UTILS/supabase
  // qua beforeParse để không cần mạng thật.
  .replace(/<script src="[^"]*"><\/script>/g, '');

const DB_GIA = {
  layTatCaBang: async () => [
    { bang:'bang_01', ten_bang:'Trồng trọt', don_vi_nhap_id:1, thu_tu:1 },
    { bang:'bang_02', ten_bang:'Chăn nuôi',  don_vi_nhap_id:2, thu_tu:2 },
  ],
  layLoaiSoLieu: async () => [{ ma:'uoc', ten:'Ước tính', co_ban:true }],
  layTatCaCot: async () => [{ id:1, ma_cot:'uoc_07/2026', tieu_de:'Ước 7/2026', thang:7, nam:2026, loai:'uoc', thu_tu_hien_thi:1, do_rong_cot:120, khoa_nhap_lieu:false, dua_vao_bieu:true }],
  layTatCaHoSo: async () => [{ id:'uuid-1', ho_ten:'Nguyễn Văn A', don_vi:'Chi cục A', vai_tro:'editor', trang_thai:true }],
  layTatCaDonVi: async () => [{ id:1, ten:'Chi cục A', thu_tu:1, trang_thai:true }, { id:2, ten:'Chi cục B', thu_tu:2, trang_thai:true }],
  dsTaiKhoanDayDu: async () => [
    { id:'uuid-1', email:'a@snnmt.gov.vn', ho_ten:'Nguyễn Văn A', don_vi_id:1, ten_don_vi:'Chi cục A', vai_tro:'editor', trang_thai:true, phai_doi_mat_khau:false, lan_dang_nhap_cuoi:null },
    { id:'uuid-admin', email:'admin@snnmt.gov.vn', ho_ten:'Quản trị', don_vi_id:null, ten_don_vi:null, vai_tro:'admin', trang_thai:true, phai_doi_mat_khau:false, lan_dang_nhap_cuoi:null },
  ],
  layTatCaQuyenDocBang: async () => [{ don_vi_id:1, bang:'bang_02' }],
  layLichSuSoLieu: async () => [
    { id:1, id_chi_tieu:'TT01', cot_id:1, bang:'bang_01', hanh_dong:'sua', gia_tri_cu:10, gia_tri_moi:20, gia_tri_text_cu:null, gia_tri_text_moi:null, ly_do:'Đối chiếu lại', nguoi_sua:'uuid-admin', vai_tro_luc_sua:'admin', thoi_diem:new Date().toISOString() },
  ],
  layGSheet: async () => [],
  layYeuCauMoKhoaGanNhat: async () => null,
  layChiTieuTheoBang: async () => [],
  layPhanQuyen: async () => [],
  onAuthChange: () => ({ data: { subscription: {} } }),
};

const NHAT_KY_LOI_CONSOLE = [];

const dom = new JSDOM(html, {
  url: 'https://baocao.local/admin.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.CONFIG = {
      SUPABASE_URL: 'x', SUPABASE_KEY: 'x', TEN_HE_THONG: 't', TEN_CO_QUAN: 'c',
      BANG: { DANH_SACH_BANG:'danh_sach_bang', CHI_TIEU:'chi_tieu', LOAI_SO_LIEU:'dm_loai_so_lieu',
        COT_BAO_CAO:'cot_bao_cao', SO_LIEU:'so_lieu', HO_SO:'ho_so', PHAN_QUYEN_BANG:'phan_quyen_bang',
        GSHEET:'danh_sach_gsheet', SO_SANH:'cau_hinh_so_sanh', DON_VI:'don_vi',
        QUYEN_DOC_BANG:'quyen_doc_bang', LICH_SU_SO_LIEU:'lich_su_so_lieu' },
    };
    window.supabase = {
      createClient: () => ({
        from: (bang) => {
          const noop = () => builder;
          const builder = {
            select: noop, eq: noop, neq: noop, in: noop, gte: noop, lte: noop,
            order: noop, limit: noop, update: noop, insert: noop, upsert: noop, delete: noop,
            single: noop, maybeSingle: noop,
            then: (res) => Promise.resolve({ data: bang === 'yeu_cau_mo_khoa' ? [] : [], error: null, count: 0 }).then(res),
          };
          return builder;
        },
        rpc: () => Promise.resolve({ data: null, error: null }),
        auth: {
          signInWithPassword: async () => ({ data: { user: { id:'uuid-admin', email:'admin@snnmt.gov.vn' } }, error: null }),
          signOut: async () => ({ error: null }),
          getSession: async () => ({ data: { session: { user: { id:'uuid-admin', email:'admin@snnmt.gov.vn' } } } }),
          getUser: async () => ({ data: { user: { id:'uuid-admin', email:'admin@snnmt.gov.vn' } } }),
          onAuthStateChange: () => ({ data: { subscription: {} } }),
        },
      }),
    };
    window.DB = Object.assign({}, DB_GIA, {
      layNguoiDungHienTai: async () => ({
        id:'uuid-admin', email:'admin@snnmt.gov.vn', ho_ten:'Quản trị viên hạn chế',
        don_vi:null, don_vi_id:null, vai_tro:'admin_han_che', phai_doi_mat_khau:false, he_dinh_dang:null,
      }),
    });
    // UTILS phải có TRƯỚC khi parse xong — jsdom tự bắn sự kiện 'load' thật
    // ngay khi tài liệu tải xong (sớm hơn nhiều so với việc eval utils.js thủ
    // công sau đó), nên tiêm ngay tại đây, không đợi.
    const utilsSrc = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
    window.eval(utilsSrc + '\nwindow.UTILS = UTILS;');
    window.UTILS_LOI = [];
    window.console.error = (...a) => { NHAT_KY_LOI_CONSOLE.push(a.map(String).join(' ')); };
    window.onerror = (msg) => { loi.push('window.onerror: ' + msg); };
  },
});

(async () => {
  // Đợi DOM/parse hoàn tất (jsdom tự bắn 'load' thật khi đó — UTILS đã có
  // sẵn từ beforeParse nên listener 'load' trong admin.html chạy được ngay).
  await new Promise(r => setTimeout(r, 300));
  const w = dom.window;

  const chk = (cond, ten) => { if (!cond) loi.push('SMOKE FAIL: ' + ten); else console.log('  OK    ' + ten); };

  chk(w.document.getElementById('sb-name').textContent !== 'Đang tải...', 'sau init: sb-name đã cập nhật (không còn "Đang tải...")');
  chk(/hạn chế/.test(w.document.getElementById('sb-role').textContent), 'sb-role hiện đúng nhãn "Quản trị hạn chế"');

  // Gọi qua các trang MỚI — mỗi hàm là async, gọi trực tiếp qua window.
  for (const [ten, fn] of [
    ['hienDonVi', 'hienDonVi'],
    ['hienTaiKhoan', 'hienTaiKhoan'],
    ['hienLichSu', 'hienLichSu'],
    ['hienQuanLyBang', 'hienQuanLyBang'],
  ]) {
    try {
      await w[fn]();
      await new Promise(r => setTimeout(r, 30));
      const html2 = w.document.getElementById('content').innerHTML;
      chk(html2 && html2.length > 50, `${ten}() chạy xong, content có render (không rỗng/lỗi)`);
    } catch (e) {
      loi.push(`${ten}() NÉM LỖI: ${e.message}\n${e.stack}`);
    }
  }

  // admin_han_che: xác nhận nút "Thêm tài khoản" / "Đặt lại MK" bị ẩn
  await w.hienTaiKhoan();
  await new Promise(r => setTimeout(r, 30));
  const contentTK = w.document.getElementById('content').innerHTML;
  chk(!contentTK.includes('+ Thêm tài khoản'), 'admin_han_che: nút "+ Thêm tài khoản" bị ẩn đúng như thiết kế');
  chk(!contentTK.includes('Đặt lại MK'), 'admin_han_che: nút "Đặt lại MK" bị ẩn đúng như thiết kế');

  // admin_han_che: xác nhận nút Xoá bảng bị ẩn ở Quản lý bảng
  await w.hienQuanLyBang();
  await new Promise(r => setTimeout(r, 30));
  const contentQLB = w.document.getElementById('content').innerHTML;
  chk(!/🗑 Xoá</.test(contentQLB), 'admin_han_che: nút "🗑 Xoá" bảng báo cáo bị ẩn đúng như thiết kế');
  chk(contentQLB.includes('Đơn vị nhập'), 'Quản lý bảng: có cột "Đơn vị nhập" mới');

  if (NHAT_KY_LOI_CONSOLE.length) {
    console.log('\n(console.error bắt được trong lúc chạy, có thể vô hại — liệt kê để soi):');
    NHAT_KY_LOI_CONSOLE.forEach(l => console.log('  console.error: ' + l));
  }

  console.log('\n══════════════════════════════════');
  if (loi.length) {
    console.log(`SMOKE TEST: ${loi.length} LỖI`);
    loi.forEach(l => console.log('  ✗ ' + l));
    process.exit(1);
  } else {
    console.log('SMOKE TEST: TẤT CẢ ĐẠT (không có ReferenceError/TypeError khi chạy các trang mới)');
    process.exit(0);
  }
})().catch(e => { console.error('LOI SMOKE TEST:', e); process.exit(1); });
