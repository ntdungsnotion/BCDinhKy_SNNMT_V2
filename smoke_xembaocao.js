const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'xembaocao.html'), 'utf8')
  .replace(/<script src="[^"]*"><\/script>/g, '');

const dom = new JSDOM(html, {
  url: 'https://baocao.local/xembaocao.html',
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
    window.DB = {
      onAuthChange: () => ({ data: { subscription: {} } }),
      layNguoiDungHienTai: async () => ({ id:'uuid-1', email:'a@x.vn', ho_ten:'Nguyễn Văn A', don_vi:'Chi cục A', don_vi_id:1, vai_tro:'editor', phai_doi_mat_khau:false }),
      layBangDuocXem: async (donViId) => donViId === 1 ? [
        { bang:'bang_01', ten_bang:'Trồng trọt', don_vi_nhap_id:1 },
        { bang:'bang_02', ten_bang:'Chăn nuôi',  don_vi_nhap_id:2 },  // được cấp quyền xem thêm
      ] : [],
      layTatCaCot: async () => [],
    };
    const utilsSrc = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
    window.eval(utilsSrc + '\nwindow.UTILS = UTILS;');
    window.onerror = (msg) => { global.__loi = global.__loi || []; global.__loi.push(String(msg)); };
  },
});

(async () => {
  await new Promise(r => setTimeout(r, 300));
  const w = dom.window;
  w.eval('window.__XEM = XEM;');
  const loi = [];
  const chk = (cond, ten) => { if (!cond) loi.push('FAIL: ' + ten); else console.log('  OK    ' + ten); };
  try {
    await w.__XEM.init();
    chk(w.__XEM.dsBang.length === 2, 'editor: loadBang dùng layBangDuocXem, trả đủ 2 bảng (nhập + xem thêm)');
    chk(w.__XEM.dsBang.some(b=>b.bang==='bang_02'), '…gồm cả bảng được cấp quyền xem thêm (bang_02)');
    const nav = w.document.getElementById('sb-nav').innerHTML;
    chk(nav.includes('Trồng trọt') && nav.includes('Chăn nuôi'), 'sidebar hiện đủ tên 2 bảng');
  } catch (e) { loi.push('Ngoại lệ: ' + e.message + '\n' + e.stack); }

  console.log('\n══════════════════════════════════');
  if (loi.length || (global.__loi && global.__loi.length)) {
    console.log('SMOKE TEST xembaocao.html: LỖI');
    loi.forEach(l => console.log('  ✗ ' + l));
    (global.__loi||[]).forEach(l => console.log('  ✗ window.onerror: ' + l));
    process.exit(1);
  } else {
    console.log('SMOKE TEST xembaocao.html: TẤT CẢ ĐẠT');
    process.exit(0);
  }
})();
