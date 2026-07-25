const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let loi = [];
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace(/<script src="[^"]*"><\/script>/g, '');

function taoDB({ phai_doi_mat_khau, vai_tro, don_vi_id }) {
  return {
    onAuthChange: () => ({ data: { subscription: {} } }),
    layNguoiDungHienTai: async () => ({
      id:'uuid-1', email:'a@snnmt.gov.vn', ho_ten:'Nguyễn Văn A', don_vi:'Chi cục A',
      don_vi_id, vai_tro, phai_doi_mat_khau, he_dinh_dang:null,
    }),
    layTatCaBang: async () => [
      { bang:'bang_01', ten_bang:'Trồng trọt', don_vi_nhap_id:1, thu_tu:1 },
      { bang:'bang_02', ten_bang:'Chăn nuôi',  don_vi_nhap_id:2, thu_tu:2 },
    ],
    layBangDuocNhap: async (donViId) => donViId ? [{ bang:'bang_01', ten_bang:'Trồng trọt', don_vi_nhap_id:donViId, thu_tu:1 }] : [],
    layCotHienThi: async () => [{ id:1, ma_cot:'uoc_07/2026', tieu_de:'Ước 7/2026', khoa_nhap_lieu:false, do_rong_cot:120 }],
    laySoSanh: async () => [],
    layGSheet: async () => [],
    doiMatKhauCuaToi: async () => {},
    luuDuLieu: async (rows) => { taoDB._lastRows = rows; },
  };
}

function chayKichBan(tenKB, dbOpts, thaoTac) {
  return new Promise((resolve) => {
    const ketQua = { ten: tenKB, loi: [] };
    const dom = new JSDOM(html, {
      url: 'https://baocao.local/index.html',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.CONFIG = { SUPABASE_URL:'x', SUPABASE_KEY:'x', TEN_HE_THONG:'t', TEN_CO_QUAN:'c',
          BANG: { DANH_SACH_BANG:'danh_sach_bang', CHI_TIEU:'chi_tieu', LOAI_SO_LIEU:'dm_loai_so_lieu',
            COT_BAO_CAO:'cot_bao_cao', SO_LIEU:'so_lieu', HO_SO:'ho_so', PHAN_QUYEN_BANG:'phan_quyen_bang',
            GSHEET:'danh_sach_gsheet', SO_SANH:'cau_hinh_so_sanh', DON_VI:'don_vi',
            QUYEN_DOC_BANG:'quyen_doc_bang', LICH_SU_SO_LIEU:'lich_su_so_lieu' } };
        window.supabase = { createClient: () => ({ from: () => ({}), rpc: () => Promise.resolve({data:null,error:null}), auth: { onAuthStateChange: () => ({data:{subscription:{}}}) } }) };
        window.DB = taoDB(dbOpts);
        const utilsSrc = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
        window.eval(utilsSrc + '\nwindow.UTILS = UTILS;');
        window.onerror = (msg) => { ketQua.loi.push('window.onerror: ' + msg); };
      },
    });
    setTimeout(async () => {
      try {
        // const APP (khai báo top-level trong <script>) KHÔNG tự thành
        // window.__APP theo chuẩn JS (chỉ var/function mới vậy) — cần eval
        // trong CHÍNH context window để lấy ra tham chiếu.
        dom.window.eval('window.__APP = APP;');
        await thaoTac(dom.window, ketQua);
      }
      catch (e) { ketQua.loi.push(`Ngoại lệ: ${e.message}`); }
      resolve(ketQua);
    }, 300);
  });
}

(async () => {
  const chk = (ketQua, cond, ten) => { if (!cond) ketQua.loi.push('FAIL: ' + ten); else console.log('  OK    [' + ketQua.ten + '] ' + ten); };

  // KB1: editor, phai_doi_mat_khau=true → modal-pass mở, chế độ buộc (ẩn nút Đóng)
  let r1 = await chayKichBan('KB1-buoc-doi-mk', { phai_doi_mat_khau:true, vai_tro:'editor', don_vi_id:1 }, async (w, kq) => {
    w.__APP.user = await w.DB.layNguoiDungHienTai();
    await w.__APP.khoiDong();
    chk(kq, w.document.getElementById('modal-pass').classList.contains('on'), 'modal-pass tự mở khi phai_doi_mat_khau=true');
    chk(kq, w.document.getElementById('btn-dong-pass').style.display === 'none', 'nút Đóng bị ẩn ở chế độ buộc đổi (không thoát được)');
    chk(kq, /Bắt buộc/.test(w.document.getElementById('modal-pass-title').textContent), 'tiêu đề modal đúng "Bắt buộc đổi mật khẩu"');
  });

  // KB2: editor bình thường (không buộc đổi) → modal-pass KHÔNG tự mở
  let r2 = await chayKichBan('KB2-binh-thuong', { phai_doi_mat_khau:false, vai_tro:'editor', don_vi_id:1 }, async (w, kq) => {
    w.__APP.user = await w.DB.layNguoiDungHienTai();
    await w.__APP.khoiDong();
    chk(kq, !w.document.getElementById('modal-pass').classList.contains('on'), 'modal-pass KHÔNG tự mở khi phai_doi_mat_khau=false');
    chk(kq, w.__APP.dsBang.length === 1 && w.__APP.dsBang[0].bang === 'bang_01', 'editor: loadBang dùng layBangDuocNhap (đúng đơn vị)');
  });

  // KB3: đổi mật khẩu thành công → tắt cờ + đóng modal
  let r3 = await chayKichBan('KB3-doi-mk-thanh-cong', { phai_doi_mat_khau:true, vai_tro:'editor', don_vi_id:1 }, async (w, kq) => {
    w.__APP.user = await w.DB.layNguoiDungHienTai();
    await w.__APP.khoiDong();
    w.document.getElementById('p-moi').value = 'MatKhauMoi123';
    w.document.getElementById('p-moi2').value = 'MatKhauMoi123';
    await w.__APP.luuPass();
    chk(kq, w.__APP.user.phai_doi_mat_khau === false, 'sau khi đổi MK thành công → user.phai_doi_mat_khau=false');
    chk(kq, !w.document.getElementById('modal-pass').classList.contains('on'), 'modal-pass đóng lại sau khi đổi MK thành công');
  });

  // KB4: admin sửa bảng KHÔNG do đơn vị mình nhập → mở modal hỏi lý do (không lưu ngay)
  let r4 = await chayKichBan('KB4-hoi-ly-do', { phai_doi_mat_khau:false, vai_tro:'admin', don_vi_id:1 }, async (w, kq) => {
    w.__APP.user = await w.DB.layNguoiDungHienTai();
    await w.__APP.khoiDong();
    w.__APP.bangHT = 'bang_02';               // bảng do đơn vị 2 nhập, admin thuộc đơn vị 1
    w.__APP.ctMap = { TT01: { kieu_du_lieu:'number' } };
    w.__APP.changes = { 'so|TT01|1': '100' };
    await w.__APP.luuDuLieu();
    chk(kq, w.document.getElementById('modal-ly-do-sua').classList.contains('on'), 'admin sửa bảng đơn vị khác → modal hỏi lý do MỞ (chưa lưu ngay)');
    chk(kq, Object.keys(w.__APP.changes).length === 1, '…dữ liệu chưa bị xoá khỏi changes (chưa lưu thật)');
  });

  // KB5: admin sửa ĐÚNG bảng đơn vị mình → lưu thẳng, KHÔNG hỏi lý do
  let r5 = await chayKichBan('KB5-khong-hoi-ly-do', { phai_doi_mat_khau:false, vai_tro:'admin', don_vi_id:1 }, async (w, kq) => {
    w.__APP.user = await w.DB.layNguoiDungHienTai();
    await w.__APP.khoiDong();
    w.__APP.bangHT = 'bang_01';               // bảng do đúng đơn vị 1 (= đơn vị admin) nhập
    w.__APP.ctMap = { TT01: { kieu_du_lieu:'number' } };
    w.__APP.changes = { 'so|TT01|1': '100' };
    await w.__APP.luuDuLieu();
    chk(kq, !w.document.getElementById('modal-ly-do-sua').classList.contains('on'), 'admin sửa đúng bảng mình → KHÔNG mở modal hỏi lý do');
    chk(kq, Object.keys(w.__APP.changes).length === 0, '…lưu thẳng luôn (changes đã được xoá sau khi lưu thành công)');
  });

  const tatCa = [r1, r2, r3, r4, r5];
  const tongLoi = tatCa.flatMap(r => r.loi.map(l => `[${r.ten}] ${l}`));
  console.log('\n══════════════════════════════════');
  if (tongLoi.length) {
    console.log(`SMOKE TEST index.html: ${tongLoi.length} LỖI`);
    tongLoi.forEach(l => console.log('  ✗ ' + l));
    process.exit(1);
  } else {
    console.log('SMOKE TEST index.html: TẤT CẢ ĐẠT');
    process.exit(0);
  }
})();
