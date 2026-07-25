// ============================================================
// TEST_BUOC_6D.JS — Nghiệm thu các hàm MỚI ở Bước 6d (db.js + utils.js)
// Chạy: node test_buoc_6d.js  (không đụng project Supabase thật)
// Bổ sung cho test.js (Bước 4) — KHÔNG lặp lại các test đã có ở đó, chỉ
// kiểm tra phần đơn vị / 2 loại admin / nhật ký sửa số liệu / RPC mới.
// ============================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ── Môi trường trình duyệt giả ───────────────────────────────
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://baocao.local/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.Event = dom.window.Event;

// ── Supabase GIẢ: ghi lại mọi lời gọi bảng lẫn RPC, trả dữ liệu định sẵn ──
const NHAT_KY = [];            // nhật ký lời gọi .from(bang)... để kiểm tra
const PHAN_HOI = {};           // PHAN_HOI[bang] = {data, error}
const RPC_NHAT_KY = [];        // nhật ký lời gọi .rpc(ten, tham_so)
const RPC_PHAN_HOI = {};       // RPC_PHAN_HOI[ten] = {data, error}
let PHIEN_HIEN_TAI = null;     // session giả

function taoBuilder(bang) {
  const ghi = { bang, ops: [] };
  NHAT_KY.push(ghi);
  const b = {};
  const chain = (ten) => (...args) => { ghi.ops.push([ten, ...args]); return b; };
  ['select','eq','neq','in','gte','lte','order','limit','update','insert','upsert','delete']
    .forEach(t => b[t] = chain(t));
  b.single = chain('single');
  b.maybeSingle = chain('maybeSingle');
  b.then = (res, rej) => {
    const ph = PHAN_HOI[bang] || { data: [], error: null };
    const laSingle = ghi.ops.some(o => o[0] === 'single' || o[0] === 'maybeSingle');
    let data = ph.data;
    if (laSingle && Array.isArray(data)) data = data[0] ?? null;
    return Promise.resolve({ data, error: ph.error || null }).then(res, rej);
  };
  return b;
}

global.supabase = {
  createClient(url, key, opts) {
    return {
      _opts: opts || null,
      from: (bang) => taoBuilder(bang),
      rpc: (ten, thamSo) => {
        RPC_NHAT_KY.push({ ten, thamSo });
        const ph = RPC_PHAN_HOI[ten] || { data: null, error: null };
        return Promise.resolve({ data: ph.data, error: ph.error || null });
      },
      auth: {
        async signInWithPassword({ email }) {
          NHAT_KY.push({ bang: '@auth.signIn', ops: [[email]] });
          if (email === 'sai@x.vn') return { data: {}, error: new Error('Invalid login credentials') };
          PHIEN_HIEN_TAI = { user: { id: 'uuid-123', email } };
          return { data: { user: PHIEN_HIEN_TAI.user }, error: null };
        },
        async signOut() { PHIEN_HIEN_TAI = null; return { error: null }; },
        async getSession() { return { data: { session: PHIEN_HIEN_TAI } }; },
        async getUser() { return { data: { user: PHIEN_HIEN_TAI ? PHIEN_HIEN_TAI.user : null } }; },
        async updateUser(x) { return { data: {}, error: null }; },
        async signUp(x) { return { data: { user: { id: 'uuid-moi', email: x.email } }, error: null }; },
        onAuthStateChange(cb) { return { data: { subscription: {} } }; },
      },
    };
  },
};

// ── Nạp 3 file thật (gộp một lần eval — const không xuyên eval riêng lẻ) ──
const doc = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
(0, eval)(
  doc('config.js') + '\n' + doc('db.js') + '\n' + doc('utils.js') +
  '\nglobalThis.CONFIG = CONFIG; globalThis.DB = DB; globalThis.UTILS = UTILS;'
);

// ── Khung test tí hon ────────────────────────────────────────
let dat = 0, truot = 0;
function ok(dk, ten) {
  if (dk) { dat++; console.log('  DAT   ' + ten); }
  else    { truot++; console.log('  TRUOT ' + ten); }
}
const timGoi = (bang) => NHAT_KY.filter(g => g.bang === bang);
const timRpc = (ten) => RPC_NHAT_KY.filter(g => g.ten === ten);
function reset() {
  NHAT_KY.length = 0; RPC_NHAT_KY.length = 0;
  Object.keys(PHAN_HOI).forEach(k => delete PHAN_HOI[k]);
  Object.keys(RPC_PHAN_HOI).forEach(k => delete RPC_PHAN_HOI[k]);
}

(async () => {
  console.log('== A. UTILS.gopBangDuocXem (hàm thuần) ==');
  reset();
  const dsBangMau = [
    { bang:'bang_01', ten_bang:'Trồng trọt', don_vi_nhap_id:10 },
    { bang:'bang_02', ten_bang:'Chăn nuôi',  don_vi_nhap_id:11 },
    { bang:'bang_03', ten_bang:'Thủy sản',   don_vi_nhap_id:12 },
    { bang:'bang_04', ten_bang:'Lâm nghiệp', don_vi_nhap_id:null },
  ];
  ok(UTILS.gopBangDuocXem(dsBangMau, null, []).length === 0, 'donViId null → mảng rỗng');
  ok(UTILS.gopBangDuocXem(dsBangMau, undefined, ['bang_02']).length === 0, 'donViId undefined → mảng rỗng (kể cả có quyền thêm)');
  let r1 = UTILS.gopBangDuocXem(dsBangMau, 10, []);
  ok(r1.length === 1 && r1[0].bang === 'bang_01', 'chỉ bảng mình nhập khi không có quyền đọc thêm');
  let r2 = UTILS.gopBangDuocXem(dsBangMau, 10, ['bang_02']);
  ok(r2.length === 2 && r2.some(b=>b.bang==='bang_01') && r2.some(b=>b.bang==='bang_02'), 'gộp đúng bảng mình nhập + bảng được cấp quyền đọc thêm');
  let r3 = UTILS.gopBangDuocXem(dsBangMau, 10, ['bang_01']);
  ok(r3.length === 1, 'bảng mình nhập trùng với quyền đọc thêm → không lặp (khử trùng)');
  let r4 = UTILS.gopBangDuocXem(dsBangMau, 10, ['bang_99']);
  ok(r4.length === 1, 'mã bảng không tồn tại trong dsBangAll → bị bỏ qua, không lỗi');
  ok(UTILS.gopBangDuocXem([], 10, ['bang_01']).length === 0, 'dsBangAll rỗng → mảng rỗng dù có quyền');
  ok(UTILS.gopBangDuocXem(null, 10, []).length === 0, 'dsBangAll null → không crash, trả mảng rỗng');
  ok(UTILS.gopBangDuocXem(dsBangMau, 10, null).length === 1, 'dsMaBangDuocCap null → không crash, coi như không có quyền thêm');

  console.log('\n== B. UTILS.canHoiLyDoSua (hàm thuần) ==');
  const bangCoDonVi   = { bang:'bang_01', don_vi_nhap_id: 10 };
  const bangChuaGiao  = { bang:'bang_04', don_vi_nhap_id: null };
  const admA  = { vai_tro:'admin',         don_vi_id: 20 };
  const admHC = { vai_tro:'admin_han_che', don_vi_id: 20 };
  const edtSelf  = { vai_tro:'editor', don_vi_id: 10 };
  const edtOther = { vai_tro:'editor', don_vi_id: 99 };
  ok(UTILS.canHoiLyDoSua(null, bangCoDonVi) === false, 'user null → false');
  ok(UTILS.canHoiLyDoSua(admA, null) === false, 'bảng null → false');
  ok(UTILS.canHoiLyDoSua(edtSelf, bangCoDonVi) === false, 'editor sửa đúng bảng mình → false');
  ok(UTILS.canHoiLyDoSua(edtOther, bangCoDonVi) === false, 'editor KHÔNG BAO GIỜ bị hỏi (kể cả sửa "hộ" bảng khác) → false');
  ok(UTILS.canHoiLyDoSua(admA, bangChuaGiao) === false, 'admin sửa bảng CHƯA giao đơn vị nào → false (không có đơn vị để so sánh)');
  ok(UTILS.canHoiLyDoSua({vai_tro:'admin', don_vi_id:10}, bangCoDonVi) === false, 'admin sửa đúng bảng đơn vị MÌNH → false');
  ok(UTILS.canHoiLyDoSua(admA, bangCoDonVi) === true, 'admin toàn quyền sửa bảng đơn vị KHÁC → true');
  ok(UTILS.canHoiLyDoSua(admHC, bangCoDonVi) === true, 'admin hạn chế sửa bảng đơn vị KHÁC → true');

  console.log('\n== C. UTILS.laAdmin / laAdminToanQuyen / nhanVaiTro ==');
  ok(UTILS.laAdmin({vai_tro:'admin'}) === true, 'laAdmin: admin → true');
  ok(UTILS.laAdmin({vai_tro:'admin_han_che'}) === true, 'laAdmin: admin_han_che → true');
  ok(UTILS.laAdmin({vai_tro:'editor'}) === false, 'laAdmin: editor → false');
  ok(UTILS.laAdmin(null) === false, 'laAdmin: null → false');
  ok(UTILS.laAdminToanQuyen({vai_tro:'admin'}) === true, 'laAdminToanQuyen: admin → true');
  ok(UTILS.laAdminToanQuyen({vai_tro:'admin_han_che'}) === false, 'laAdminToanQuyen: admin_han_che → false');
  ok(UTILS.laAdminToanQuyen({vai_tro:'editor'}) === false, 'laAdminToanQuyen: editor → false');
  ok(UTILS.laAdminToanQuyen(null) === false, 'laAdminToanQuyen: null → false');
  ok(UTILS.nhanVaiTro('admin').includes('Quản trị viên'), 'nhanVaiTro: admin');
  ok(UTILS.nhanVaiTro('admin_han_che').includes('hạn chế'), 'nhanVaiTro: admin_han_che');
  ok(UTILS.nhanVaiTro('editor').includes('nhập liệu'), 'nhanVaiTro: editor');
  ok(UTILS.nhanVaiTro('la_gi_do_khong_biet') === 'la_gi_do_khong_biet', 'nhanVaiTro: giá trị lạ → trả nguyên văn');
  ok(UTILS.nhanVaiTro(undefined) === '', 'nhanVaiTro: undefined → chuỗi rỗng, không crash');

  console.log('\n== D. DB — ĐƠN VỊ (don_vi) ==');
  reset();
  PHAN_HOI['don_vi'] = { data: [{id:1,ten:'Chi cục A',thu_tu:1,trang_thai:true}], error: null };
  let dsDV = await DB.layTatCaDonVi();
  ok(dsDV.length === 1 && dsDV[0].ten === 'Chi cục A', 'layTatCaDonVi trả đúng dữ liệu');
  ok(timGoi('don_vi')[0].ops.some(o=>o[0]==='order'), 'layTatCaDonVi có sắp xếp (order)');

  reset();
  PHAN_HOI['don_vi'] = { data: {id:5,ten:'Chi cục Mới'}, error: null };
  let dvMoi = await DB.themDonVi({ten:'Chi cục Mới', thu_tu:5, trang_thai:true});
  ok(dvMoi.id === 5, 'themDonVi trả về dòng vừa tạo (có id)');
  ok(timGoi('don_vi')[0].ops.some(o=>o[0]==='insert'), 'themDonVi gọi insert');

  reset();
  PHAN_HOI['don_vi'] = { data: null, error: null };
  await DB.suaDonVi(7, {ten:'Đổi tên'});
  const opsSua = timGoi('don_vi')[0].ops;
  ok(opsSua.some(o=>o[0]==='update' && o[1].ten==='Đổi tên'), 'suaDonVi gọi update đúng dữ liệu');
  ok(opsSua.some(o=>o[0]==='eq' && o[1]==='id' && o[2]===7), 'suaDonVi lọc đúng id');

  reset();
  PHAN_HOI['don_vi'] = { data: null, error: null };
  await DB.xoaDonVi(9);
  const opsXoa = timGoi('don_vi')[0].ops;
  ok(opsXoa.some(o=>o[0]==='delete'), 'xoaDonVi gọi delete');
  ok(opsXoa.some(o=>o[0]==='eq' && o[1]==='id' && o[2]===9), 'xoaDonVi lọc đúng id');

  console.log('\n== E. DB — Bảng được nhập / được xem / quyền đọc thêm ==');
  reset();
  ok((await DB.layBangDuocNhap(null)).length === 0, 'layBangDuocNhap(null) → [] KHÔNG gọi mạng');
  ok(NHAT_KY.length === 0, '…xác nhận không có lời gọi .from() nào khi donViId rỗng');

  reset();
  PHAN_HOI['danh_sach_bang'] = { data: [{bang:'bang_01',don_vi_nhap_id:10}], error: null };
  let bDuocNhap = await DB.layBangDuocNhap(10);
  ok(bDuocNhap.length === 1, 'layBangDuocNhap(10) trả đúng dữ liệu giả lập');
  const opsNhap = timGoi('danh_sach_bang')[0].ops;
  ok(opsNhap.some(o=>o[0]==='eq' && o[1]==='don_vi_nhap_id' && o[2]===10), 'layBangDuocNhap lọc đúng don_vi_nhap_id');

  reset();
  PHAN_HOI['quyen_doc_bang'] = { data: [{don_vi_id:10,bang:'bang_02'},{don_vi_id:10,bang:'bang_03'}], error: null };
  let dsQuyen = await DB.layTatCaQuyenDocBang();
  ok(dsQuyen.length === 2, 'layTatCaQuyenDocBang trả toàn bộ (không lọc)');

  reset();
  ok((await DB.layQuyenDocBangCuaDonVi(null)).length === 0, 'layQuyenDocBangCuaDonVi(null) → [] không gọi mạng');
  reset();
  PHAN_HOI['quyen_doc_bang'] = { data: [{bang:'bang_02'},{bang:'bang_03'}], error: null };
  let maBangs = await DB.layQuyenDocBangCuaDonVi(10);
  ok(JSON.stringify(maBangs) === JSON.stringify(['bang_02','bang_03']), 'layQuyenDocBangCuaDonVi rút đúng mảng mã bảng từ {bang}');

  reset();
  ok((await DB.layBangDuocXem(null)).length === 0, 'layBangDuocXem(null) → [] không gọi mạng');

  reset();
  PHAN_HOI['danh_sach_bang'] = { data: dsBangMau, error: null };
  PHAN_HOI['quyen_doc_bang'] = { data: [{bang:'bang_02'}], error: null };
  let bDuocXem = await DB.layBangDuocXem(10);
  ok(bDuocXem.length === 2 && bDuocXem.some(b=>b.bang==='bang_01') && bDuocXem.some(b=>b.bang==='bang_02'),
     'layBangDuocXem gộp đúng qua UTILS.gopBangDuocXem (bảng mình nhập + được cấp thêm)');

  reset();
  PHAN_HOI['quyen_doc_bang'] = { data: null, error: null };
  await DB.luuQuyenDocBang(10, ['bang_02','bang_03']);
  const goiQuyen = timGoi('quyen_doc_bang');
  ok(goiQuyen.length === 2, 'luuQuyenDocBang gọi .from() đúng 2 lần (xoá cũ rồi chèn mới)');
  ok(goiQuyen[0].ops.some(o=>o[0]==='delete') && goiQuyen[0].ops.some(o=>o[0]==='eq' && o[1]==='don_vi_id' && o[2]===10),
     'luuQuyenDocBang: bước 1 xoá đúng theo don_vi_id');
  ok(goiQuyen[1].ops.some(o=>o[0]==='insert' && o[1].length===2), 'luuQuyenDocBang: bước 2 chèn đúng 2 dòng mới');

  reset();
  PHAN_HOI['quyen_doc_bang'] = { data: null, error: null };
  await DB.luuQuyenDocBang(10, []);
  const goiQuyenRong = timGoi('quyen_doc_bang');
  ok(goiQuyenRong.length === 1, 'luuQuyenDocBang([]) chỉ xoá, KHÔNG gọi insert khi danh sách rỗng');

  console.log('\n== F. DB — Nhật ký sửa số liệu (lich_su_so_lieu) ==');
  reset();
  PHAN_HOI['lich_su_so_lieu'] = { data: [{id:1,id_chi_tieu:'TT01',cot_id:5}], error: null };
  let lichSu1 = await DB.layLichSuSoLieu();
  ok(lichSu1.length === 1, 'layLichSuSoLieu() không tham số vẫn chạy, trả dữ liệu');
  let opsLS1 = timGoi('lich_su_so_lieu')[0].ops;
  ok(opsLS1.some(o=>o[0]==='order' && o[1]==='thoi_diem'), 'layLichSuSoLieu mặc định sắp theo thoi_diem');
  ok(opsLS1.some(o=>o[0]==='limit' && o[1]===100), 'layLichSuSoLieu mặc định limit 100');

  reset();
  PHAN_HOI['lich_su_so_lieu'] = { data: [], error: null };
  await DB.layLichSuSoLieu({ bang: 'bang_01' });
  ok(timGoi('lich_su_so_lieu')[0].ops.some(o=>o[0]==='eq' && o[1]==='bang' && o[2]==='bang_01'), 'layLichSuSoLieu({bang}) lọc đúng bảng');

  reset();
  PHAN_HOI['lich_su_so_lieu'] = { data: [], error: null };
  await DB.layLichSuSoLieu({ idChiTieu: 'TT01', cotId: 9 });
  let opsLS2 = timGoi('lich_su_so_lieu')[0].ops;
  ok(opsLS2.some(o=>o[0]==='eq' && o[1]==='id_chi_tieu' && o[2]==='TT01'), 'layLichSuSoLieu({idChiTieu}) lọc đúng chỉ tiêu');
  ok(opsLS2.some(o=>o[0]==='eq' && o[1]==='cot_id' && o[2]===9), 'layLichSuSoLieu({cotId}) lọc đúng cột');

  reset();
  PHAN_HOI['lich_su_so_lieu'] = { data: [], error: null };
  await DB.layLichSuSoLieu({ gioiHan: 25 });
  ok(timGoi('lich_su_so_lieu')[0].ops.some(o=>o[0]==='limit' && o[1]===25), 'layLichSuSoLieu({gioiHan}) áp dụng limit tuỳ chỉnh');

  console.log('\n== G. DB — RPC quản trị tài khoản (Bước 6c/6d) ==');
  reset();
  RPC_PHAN_HOI['ds_tai_khoan'] = { data: [{id:'u1',email:'a@x.vn',vai_tro:'editor'}], error: null };
  let dsTK = await DB.dsTaiKhoanDayDu();
  ok(dsTK.length === 1 && dsTK[0].email === 'a@x.vn', 'dsTaiKhoanDayDu gọi RPC ds_tai_khoan, trả đúng dữ liệu');
  ok(timRpc('ds_tai_khoan').length === 1, 'dsTaiKhoanDayDu chỉ gọi RPC đúng 1 lần');

  reset();
  RPC_PHAN_HOI['ds_tai_khoan'] = { data: null, error: new Error('Chỉ quản trị viên mới xem được danh sách tài khoản.') };
  let loi1 = null;
  try { await DB.dsTaiKhoanDayDu(); } catch(e) { loi1 = e; }
  ok(loi1 && /quản trị viên/.test(loi1.message), 'dsTaiKhoanDayDu ném lỗi đúng khi RPC báo lỗi (không phải admin)');

  reset();
  RPC_PHAN_HOI['tao_tai_khoan'] = { data: 'uuid-moi-123', error: null };
  let uuidMoi = await DB.taoTaiKhoan('  Test@Snnmt.Gov.VN  ', 'MatKhau123', { don_vi_id: 3, ho_ten: 'Nguyễn Văn A', vai_tro: 'admin_han_che' });
  ok(uuidMoi === 'uuid-moi-123', 'taoTaiKhoan trả về uuid RPC trả về');
  let goiTao = timRpc('tao_tai_khoan')[0].thamSo;
  ok(goiTao.p_email === 'test@snnmt.gov.vn', 'taoTaiKhoan chuẩn hoá email (trim + lowercase)');
  ok(goiTao.p_don_vi_id === 3, 'taoTaiKhoan truyền đúng p_don_vi_id');
  ok(goiTao.p_vai_tro === 'admin_han_che', 'taoTaiKhoan truyền đúng p_vai_tro (admin_han_che)');
  ok(goiTao.p_ho_ten === 'Nguyễn Văn A', 'taoTaiKhoan truyền đúng p_ho_ten');

  reset();
  RPC_PHAN_HOI['tao_tai_khoan'] = { data: 'uuid-2', error: null };
  await DB.taoTaiKhoan('b@x.vn', 'MatKhau123');
  let goiTaoMacDinh = timRpc('tao_tai_khoan')[0].thamSo;
  ok(goiTaoMacDinh.p_vai_tro === 'editor', 'taoTaiKhoan mặc định vai_tro=editor khi không truyền option');
  ok(goiTaoMacDinh.p_don_vi_id === null, 'taoTaiKhoan mặc định p_don_vi_id=null khi không truyền');

  reset();
  RPC_PHAN_HOI['dat_lai_mat_khau'] = { data: null, error: null };
  await DB.datLaiMatKhau('uuid-abc', 'MatKhauMoi123');
  let goiDLMK = timRpc('dat_lai_mat_khau')[0].thamSo;
  ok(goiDLMK.p_user_id === 'uuid-abc' && goiDLMK.p_mat_khau === 'MatKhauMoi123', 'datLaiMatKhau truyền đúng tham số RPC');

  reset();
  RPC_PHAN_HOI['dat_lai_mat_khau'] = { data: null, error: new Error('Chỉ quản trị viên toàn quyền mới đặt lại được mật khẩu.') };
  let loi2 = null;
  try { await DB.datLaiMatKhau('uuid-abc', 'MatKhauMoi123'); } catch(e) { loi2 = e; }
  ok(loi2 && /toàn quyền/.test(loi2.message), 'datLaiMatKhau ném lỗi đúng khi admin_han_che gọi (CSDL chặn)');

  reset();
  RPC_PHAN_HOI['doi_mat_khau_cua_toi'] = { data: null, error: null };
  await DB.doiMatKhauCuaToi('MatKhauMoiCuaToi123');
  ok(timRpc('doi_mat_khau_cua_toi')[0].thamSo.p_mat_khau === 'MatKhauMoiCuaToi123', 'doiMatKhauCuaToi gọi đúng RPC doi_mat_khau_cua_toi (không còn auth.updateUser trực tiếp)');

  reset();
  RPC_PHAN_HOI['doi_mat_khau_cua_toi'] = { data: null, error: new Error('Mật khẩu phải có ít nhất 8 ký tự.') };
  let loi3 = null;
  try { await DB.doiMatKhauCuaToi('ngan'); } catch(e) { loi3 = e; }
  ok(loi3 && /8 ký tự/.test(loi3.message), 'doiMatKhauCuaToi ném lỗi đúng khi RPC từ chối mật khẩu ngắn');

  console.log('\n== H. dangNhap / layNguoiDungHienTai trả thêm don_vi_id + phai_doi_mat_khau ==');
  reset();
  PHAN_HOI['ho_so'] = { data: { id:'uuid-123', ho_ten:'Nguyễn Văn B', don_vi:'Chi cục A', don_vi_id: 10, vai_tro:'editor', trang_thai:true, phai_doi_mat_khau:true }, error: null };
  let nd1 = await DB.dangNhap('b@x.vn', 'MatKhau123');
  ok(nd1.don_vi_id === 10, 'dangNhap trả đúng don_vi_id từ ho_so');
  ok(nd1.phai_doi_mat_khau === true, 'dangNhap trả đúng phai_doi_mat_khau=true khi admin vừa đặt lại MK');

  reset();
  PHAN_HOI['ho_so'] = { data: { id:'uuid-123', ho_ten:'Nguyễn Văn B', don_vi:'Chi cục A', don_vi_id: 10, vai_tro:'editor', trang_thai:true, phai_doi_mat_khau:false }, error: null };
  let nd2 = await DB.dangNhap('b@x.vn', 'MatKhau123');
  ok(nd2.phai_doi_mat_khau === false, 'dangNhap trả đúng phai_doi_mat_khau=false ở trạng thái bình thường');

  reset();
  PHIEN_HIEN_TAI = { user: { id:'uuid-123', email:'b@x.vn' } };
  PHAN_HOI['ho_so'] = { data: { id:'uuid-123', ho_ten:'Nguyễn Văn B', don_vi:'Chi cục A', don_vi_id: 7, vai_tro:'admin_han_che', trang_thai:true, phai_doi_mat_khau:false }, error: null };
  let nd3 = await DB.layNguoiDungHienTai();
  ok(nd3.don_vi_id === 7, 'layNguoiDungHienTai trả đúng don_vi_id');
  ok(nd3.vai_tro === 'admin_han_che', 'layNguoiDungHienTai trả đúng vai_tro admin_han_che');
  ok(nd3.phai_doi_mat_khau === false, 'layNguoiDungHienTai trả đúng phai_doi_mat_khau');
  PHIEN_HIEN_TAI = null;

  console.log('\n== I. luuDuLieu — cột "đi nhờ" ly_do_sua truyền nguyên vẹn ==');
  reset();
  PHIEN_HIEN_TAI = { user: { id:'uuid-123', email:'b@x.vn' } };
  PHAN_HOI['so_lieu'] = { data: null, error: null };
  await DB.luuDuLieu([{ id_chi_tieu:'TT01', cot_id:5, gia_tri:100, ly_do_sua:'Admin chỉnh theo đối chiếu' }]);
  let opsSoLieu = timGoi('so_lieu')[0].ops;
  let upsertCall = opsSoLieu.find(o=>o[0]==='upsert');
  ok(upsertCall[1][0].ly_do_sua === 'Admin chỉnh theo đối chiếu', 'luuDuLieu giữ nguyên cột ly_do_sua khi có (đi nhờ tới trigger CSDL)');
  ok(upsertCall[1][0].nguoi_nhap === 'uuid-123', '…vẫn tự gắn nguoi_nhap = uuid đang đăng nhập như trước');
  PHIEN_HIEN_TAI = null;

  reset();
  console.log('\n══════════════════════════════════');
  console.log(`KET QUA: ${dat} DAT, ${truot} TRUOT / ${dat + truot} kiem tra`);
  process.exit(truot ? 1 : 0);
})().catch(e => { console.error('LOI TEST:', e); process.exit(1); });
