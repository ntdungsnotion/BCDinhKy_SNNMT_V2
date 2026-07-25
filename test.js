// ============================================================
// TEST.JS — Nghiệm thu db.js + utils.js V2 bằng jsdom + Supabase GIẢ
// Chạy: node test.js  (không đụng project Supabase thật)
// ============================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ── Môi trường trình duyệt giả ───────────────────────────────
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="toast"></div>
  <table id="bang-nhap"><tbody>
    <tr><td><input class="o-so" id="i00"></td><td><input class="o-so" id="i01"></td></tr>
    <tr><td><input class="o-so" id="i10"></td><td><input class="o-so" id="i11"></td></tr>
  </tbody></table>
</body></html>`, { url: 'https://baocao.local/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.Event = dom.window.Event;

// ── Supabase GIẢ: ghi lại mọi lời gọi, trả dữ liệu định sẵn ──
const NHAT_KY = [];            // nhật ký lời gọi để kiểm tra
const PHAN_HOI = {};           // PHAN_HOI[bang] = {data, error}
let PHIEN_HIEN_TAI = null;     // session giả

function taoBuilder(bang) {
  const ghi = { bang, ops: [] };
  NHAT_KY.push(ghi);
  const b = {};
  const chain = (ten) => (...args) => { ghi.ops.push([ten, ...args]); return b; };
  ['select','eq','neq','in','gte','lte','order','update','insert','upsert','delete']
    .forEach(t => b[t] = chain(t));
  b.single = chain('single');
  b.maybeSingle = chain('maybeSingle');
  b.then = (res, rej) => {
    const ph = PHAN_HOI[bang] || { data: [], error: null };
    // single/maybeSingle trả 1 object thay vì mảng
    const laSingle = ghi.ops.some(o => o[0] === 'single' || o[0] === 'maybeSingle');
    let data = ph.data;
    if (laSingle && Array.isArray(data)) data = data[0] ?? null;
    return Promise.resolve({ data, error: ph.error || null }).then(res, rej);
  };
  return b;
}

global.RPC_NHAT_KY = [];         // MỚI Bước 6d: nhật ký lời gọi .rpc(ten, tham_so)
global.RPC_PHAN_HOI = {};        // RPC_PHAN_HOI[ten] = {data, error}
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
        async signOut() { NHAT_KY.push({ bang: '@auth.signOut', ops: [] }); PHIEN_HIEN_TAI = null; return { error: null }; },
        async getSession() { return { data: { session: PHIEN_HIEN_TAI } }; },
        async getUser() { return { data: { user: PHIEN_HIEN_TAI ? PHIEN_HIEN_TAI.user : null } }; },
        async updateUser(x) { NHAT_KY.push({ bang: '@auth.updateUser', ops: [[x]] }); return { data: {}, error: null }; },
        async signUp(x) { NHAT_KY.push({ bang: '@auth.signUp', ops: [[x]] }); return { data: { user: { id: 'uuid-moi', email: x.email } }, error: null }; },
        onAuthStateChange(cb) { NHAT_KY.push({ bang: '@auth.onChange', ops: [] }); return { data: { subscription: {} } }; },
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

(async () => {
  console.log('== 1. parseSo (giữ nguyên hành vi V1) ==');
  ok(UTILS.parseSo('10.000') === 10000, '"10.000" → 10000');
  ok(UTILS.parseSo('10.5') === 10.5, '"10.5" → 10.5');
  ok(UTILS.parseSo('10.000,5') === 10000.5, '"10.000,5" → 10000.5');
  ok(UTILS.parseSo('10,5') === 10.5, '"10,5" → 10.5');
  ok(UTILS.parseSo('10,000.5') === 10000.5, '"10,000.5" → 10000.5');
  ok(UTILS.parseSo('1.000.000') === 1000000, '"1.000.000" → 1000000');
  ok(UTILS.parseSo('') === null && UTILS.parseSo('abc') === null, 'rỗng/chữ → null');

  console.log('== 2. formatSo ==');
  ok(UTILS.formatSo(10000) === '10.000', '10000 → "10.000"');
  ok(UTILS.formatSo(10000.45) === '10.000,45', '10000.45 → "10.000,45"');
  ok(UTILS.formatSo(10000.456) === '10.000,46', '10000.456 → "10.000,46"');
  ok(UTILS.formatSo(null) === '', 'null → ""');

  console.log('== 3. sinhMaCot / sinhTieuDe (quy ước mục 3.2) ==');
  ok(UTILS.sinhMaCot('uoc', 7, 2026) === 'uoc_07/2026', "('uoc',7,2026) → 'uoc_07/2026'");
  ok(UTILS.sinhMaCot('lkct', 12, 2025) === 'lkct_12/2025', "('lkct',12,2025) → 'lkct_12/2025'");
  ok(UTILS.sinhMaCot('kh', 1, 2027) === 'KH2027', "('kh',1,2027) → 'KH2027'");
  ok(UTILS.sinhMaCot('kh', 1, 2027, 'T7/2026') === 'KH2027_T7/2026', "kh + hậu tố → 'KH2027_T7/2026'");
  ok(UTILS.sinhTieuDe('Ước tháng {t} năm {n}', 7, 2026) === 'Ước tháng 7 năm 2026', 'sinhTieuDe thay {t}/{n}');
  ok(UTILS.sinhTieuDe('Tháng {t}/{n} theo NGTK', 6, 2026) === 'Tháng 6/2026 theo NGTK', 'sinhTieuDe khuôn NGTK');

  console.log('== 4. DB.dangNhap ==');
  PHAN_HOI['ho_so'] = { data: [{ id: 'uuid-123', ho_ten: 'CV 1', don_vi: 'Chi cục A', vai_tro: 'editor', trang_thai: true }] };
  const nd = await DB.dangNhap('  CV@snnmt.gov.vn ', 'mk');
  ok(nd.id === 'uuid-123' && nd.vai_tro === 'editor' && nd.don_vi === 'Chi cục A', 'đăng nhập OK, trả hồ sơ gộp');
  ok(timGoi('@auth.signIn').at(-1).ops[0][0] === 'cv@snnmt.gov.vn', 'email được trim + lowercase');

  // tài khoản ngưng dùng → phải signOut + throw
  PHAN_HOI['ho_so'] = { data: [{ id: 'uuid-123', trang_thai: false, vai_tro: 'editor' }] };
  let loi = null;
  try { await DB.dangNhap('cv@snnmt.gov.vn', 'mk'); } catch (e) { loi = e; }
  ok(loi && /ngưng/.test(loi.message), 'tài khoản ngưng dùng → báo lỗi');
  ok(timGoi('@auth.signOut').length >= 1, '…và đã signOut để hủy phiên');

  console.log('== 5. DB.layNguoiDungHienTai ==');
  PHIEN_HIEN_TAI = null;
  ok(await DB.layNguoiDungHienTai() === null, 'chưa đăng nhập → null');
  PHIEN_HIEN_TAI = { user: { id: 'uuid-123', email: 'cv@snnmt.gov.vn' } };
  PHAN_HOI['ho_so'] = { data: [{ id: 'uuid-123', ho_ten: 'CV 1', don_vi: 'Chi cục A', vai_tro: 'admin', trang_thai: true }] };
  const nd2 = await DB.layNguoiDungHienTai();
  ok(nd2 && nd2.vai_tro === 'admin', 'có phiên → trả hồ sơ gộp');

  console.log('== 6. DB.luuDuLieu (tự gắn nguoi_nhap uuid) ==');
  NHAT_KY.length = 0;
  PHAN_HOI['so_lieu'] = { data: [], error: null };
  await DB.luuDuLieu([{ id_chi_tieu: 'TT01', cot_id: 5, gia_tri: 123 }]);
  const goiSL = timGoi('so_lieu').at(-1);
  const opUpsert = goiSL.ops.find(o => o[0] === 'upsert');
  ok(!!opUpsert, 'gọi upsert vào so_lieu');
  ok(opUpsert[1][0].nguoi_nhap === 'uuid-123', 'tự gắn nguoi_nhap = uuid đang đăng nhập');
  ok(typeof opUpsert[1][0].thoi_gian_nhap === 'string', 'tự gắn thoi_gian_nhap');
  ok(opUpsert[2].onConflict === 'id_chi_tieu,cot_id', "onConflict = 'id_chi_tieu,cot_id' (khớp PK)");
  await DB.luuDuLieu([]);   // không được gọi API khi rỗng
  ok(timGoi('so_lieu').length === 1, 'mảng rỗng → không gọi API');

  console.log('== 7. DB.layDuLieu (lọc bảng qua inner join chi_tieu) ==');
  NHAT_KY.length = 0;
  PHAN_HOI['so_lieu'] = { data: [{ id_chi_tieu: 'TT01', cot_id: 5, gia_tri: 1 }] };
  await DB.layDuLieu('bang_01', [5, 6]);
  const goiLay = timGoi('so_lieu').at(-1);
  const opSel = goiLay.ops.find(o => o[0] === 'select');
  ok(opSel[1].includes('chi_tieu!inner(bang)'), 'select có chi_tieu!inner(bang)');
  ok(goiLay.ops.some(o => o[0] === 'eq' && o[1] === 'chi_tieu.bang' && o[2] === 'bang_01'), "lọc eq('chi_tieu.bang', maBang)");
  ok(goiLay.ops.some(o => o[0] === 'in' && o[1] === 'cot_id'), "lọc in('cot_id', dsCotId)");

  console.log('== 8. DB.luuPhanQuyen (uuid, xóa cũ → chèn mới) ==');
  NHAT_KY.length = 0;
  PHAN_HOI['phan_quyen_bang'] = { data: [], error: null };
  await DB.luuPhanQuyen('uuid-123', ['bang_01', 'bang_02']);
  const goiPQ = timGoi('phan_quyen_bang');
  ok(goiPQ[0].ops.some(o => o[0] === 'delete') &&
     goiPQ[0].ops.some(o => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'uuid-123'),
     'xóa phân quyền cũ theo user_id uuid');
  const opIns = goiPQ[1].ops.find(o => o[0] === 'insert');
  ok(opIns[1].length === 2 && opIns[1][0].user_id === 'uuid-123' && opIns[1][1].bang === 'bang_02',
     'chèn dòng mới {user_id, bang}');

  console.log('== 9. DB.themCot / timCot / layCotHienThi ==');
  NHAT_KY.length = 0;
  PHAN_HOI['cot_bao_cao'] = { data: [{ id: 9, ma_cot: 'uoc_07/2026' }] };
  const cotMoi = await DB.themCot({ ma_cot: 'uoc_07/2026', thang: 7, nam: 2026, loai: 'uoc', tieu_de: 'Ước tháng 7 năm 2026' });
  ok(cotMoi && cotMoi.id === 9, 'themCot trả về dòng vừa tạo (có id)');
  const goiThem = timGoi('cot_bao_cao')[0];
  ok(!('id' in (goiThem.ops.find(o => o[0]==='insert')[1])), 'insert KHÔNG gửi id (identity tự sinh)');
  await DB.timCot(7, 2026, 'uoc');
  const goiTim = timGoi('cot_bao_cao').at(-1);
  ok(['thang','nam','loai'].every(c => goiTim.ops.some(o => o[0]==='eq' && o[1]===c)), 'timCot lọc đủ (thang, nam, loai)');
  await DB.layCotHienThi();
  const goiHT = timGoi('cot_bao_cao').at(-1);
  ok(goiHT.ops.some(o => o[0]==='eq' && o[1]==='dua_vao_bieu' && o[2]===true), 'layCotHienThi lọc dua_vao_bieu=true');

  console.log('== 10. DB.taoTaiKhoan (RPC tao_tai_khoan — đổi ở Bước 6c/6d, không còn auth.signUp) ==');
  RPC_NHAT_KY.length = 0;
  RPC_PHAN_HOI['tao_tai_khoan'] = { data: 'uuid-moi', error: null };
  const u = await DB.taoTaiKhoan('Moi@snnmt.gov.vn', 'Mk@123456', { don_vi_id: 4, ho_ten: 'CV 2', vai_tro: 'editor' });
  const goiTao = RPC_NHAT_KY.at(-1);
  ok(u === 'uuid-moi', 'taoTaiKhoan trả về uuid RPC trả về (không còn trả object user như signUp)');
  ok(goiTao.ten === 'tao_tai_khoan', 'gọi đúng RPC tao_tai_khoan');
  ok(goiTao.thamSo.p_email === 'moi@snnmt.gov.vn', 'email lowercase + trim trước khi gửi RPC');
  ok(goiTao.thamSo.p_don_vi_id === 4, 'truyền đúng p_don_vi_id (thay cho don_vi text V1/6b)');
  ok(goiTao.thamSo.p_vai_tro === 'editor', 'truyền đúng p_vai_tro (RPC phía CSDL tự kiểm hợp lệ, xem test_buoc_6d.js nhóm G)');

  console.log('== 11. UTILS session cache (localStorage, key u2) ==');
  UTILS.luuSession({ id: 'uuid-123', vai_tro: 'admin' });
  ok(UTILS.laySession().vai_tro === 'admin', 'luu/laySession hoạt động');
  ok(localStorage.getItem('u2') !== null && localStorage.getItem('u') === null, "dùng key 'u2', không đụng key 'u' của V1");
  UTILS.xoaSession();
  ok(UTILS.laySession() === null, 'xoaSession xóa sạch');

  console.log('== 12. UTILS.kiemTraDangNhap (làm tươi cache theo phiên thật) ==');
  PHIEN_HIEN_TAI = { user: { id: 'uuid-123', email: 'cv@snnmt.gov.vn' } };
  PHAN_HOI['ho_so'] = { data: [{ id: 'uuid-123', ho_ten: 'CV 1', don_vi: 'CC A', vai_tro: 'editor', trang_thai: true }] };
  const kt = await UTILS.kiemTraDangNhap();
  ok(kt && UTILS.laySession().id === 'uuid-123', 'có phiên → cache được làm tươi');
  PHIEN_HIEN_TAI = null;
  ok((await UTILS.kiemTraDangNhap()) === null && UTILS.laySession() === null, 'mất phiên → cache bị xóa');

  console.log('== 13. UTILS.xuLyPaste (dán 2×2 từ Excel, số VN + Anh/Mỹ) ==');
  const i00 = document.getElementById('i00');
  const clip = '10.000\t20,5\n1.000.000\t10,000.5';
  const eGia = { clipboardData: { getData: () => clip }, preventDefault(){ this.pd = true; } };
  UTILS.xuLyPaste(eGia, i00);
  ok(eGia.pd === true, 'paste bảng → preventDefault');
  ok(document.getElementById('i00').value === '10000', 'ô (0,0): "10.000" → 10000');
  ok(document.getElementById('i01').value === '20.5', 'ô (0,1): "20,5" → 20.5');
  ok(document.getElementById('i10').value === '1000000', 'ô (1,0): "1.000.000" → 1000000');
  ok(document.getElementById('i11').value === '10000.5', 'ô (1,1): "10,000.5" → 10000.5 (V1 hiểu sai ca này)');

  console.log('== 14. doanHeDinhDang / parseSoTheoHe (định dạng máy hỗn loạn) ==');
  ok(UTILS.doanHeDinhDang(['10.000', '1.234,5']) === 'vn', "khối có '1.234,5' → hệ VN");
  ok(UTILS.doanHeDinhDang(['10.000', '1,234.5']) === 'us', "khối có '1,234.5' → hệ Anh-Mỹ");
  ok(UTILS.doanHeDinhDang(['1.234.567']) === 'vn', "'1.234.567' (nhiều nhóm chấm) → VN");
  ok(UTILS.doanHeDinhDang(['1,234,567']) === 'us', "'1,234,567' (nhiều nhóm phẩy) → Anh-Mỹ");
  ok(UTILS.doanHeDinhDang(['10,5']) === 'vn' && UTILS.doanHeDinhDang(['10.5']) === 'us',
     "'10,5' → VN, '10.5' → Anh-Mỹ");
  ok(UTILS.doanHeDinhDang(['10.000']) === null, "'10.000' đơn lẻ → mơ hồ, không kết luận");
  ok(UTILS.doanHeDinhDang(['10.5', '1.234,5']) === null, 'manh mối mâu thuẫn → null (đoán từng ô)');
  ok(UTILS.parseSoTheoHe('10.000', 'vn') === 10000 && UTILS.parseSoTheoHe('10.000', 'us') === 10,
     "'10.000' theo hệ: vn → 10000, us → 10");
  ok(UTILS.parseSoTheoHe('10.000', null) === 10000, 'hệ null → parseSo (thiên VN khi mơ hồ)');

  console.log('== 15. xuLyPaste khối từ MÁY ANH-MỸ (ca V1 và bản đoán từng ô đều sai) ==');
  ['i00','i01','i10','i11'].forEach(id => { document.getElementById(id).value = ''; });
  const clipUS = '10.000\t1,234.5\n0.75\t2,000';
  const eUS = { clipboardData: { getData: () => clipUS }, preventDefault(){ this.pd = true; } };
  UTILS.xuLyPaste(eUS, document.getElementById('i00'));
  ok(document.getElementById('i00').value === '10', '"10.000" trong khối Anh-Mỹ → 10 (không phải 10000)');
  ok(document.getElementById('i01').value === '1234.5', '"1,234.5" → 1234.5');
  ok(document.getElementById('i10').value === '0.75', '"0.75" → 0.75');
  ok(document.getElementById('i11').value === '2000', '"2,000" → 2000');

  console.log('== 16. Trí nhớ hệ định dạng qua NHIỀU lần dán (một phiên) ==');
  localStorage.removeItem('he2');
  const inp = id => document.getElementById(id);
  ['i00','i01','i10','i11'].forEach(id => { inp(id).value = ''; });
  // Lần dán 1: có manh mối Anh-Mỹ → dùng + GHI NHỚ
  UTILS.xuLyPaste({ clipboardData: { getData: () => '1,234.5\t2' }, preventDefault(){} }, inp('i00'));
  ok(localStorage.getItem('he2') === 'us', 'lần dán 1 có "1,234.5" → trí nhớ = us');
  // Lần dán 2: TOÀN ô mơ hồ → phải dùng trí nhớ, không rơi về mặc định VN
  ['i00','i01','i10','i11'].forEach(id => { inp(id).value = ''; });
  UTILS.xuLyPaste({ clipboardData: { getData: () => '10.000\t20.000' }, preventDefault(){} }, inp('i00'));
  ok(inp('i00').value === '10' && inp('i01').value === '20',
     'lần dán 2 mơ hồ "10.000/20.000" → theo trí nhớ us ra 10/20 (không phải 10000)');
  // Lần dán 3: manh mối VN ngược trí nhớ → manh mối MỚI thắng và ghi đè
  ['i00','i01','i10','i11'].forEach(id => { inp(id).value = ''; });
  UTILS.xuLyPaste({ clipboardData: { getData: () => '10.000\t1.234,5' }, preventDefault(){} }, inp('i00'));
  ok(inp('i00').value === '10000' && localStorage.getItem('he2') === 'vn',
     'lần dán 3 có "1.234,5" → hiểu theo VN và trí nhớ đổi thành vn');

  console.log('== 17. docExcel: tải file .xlsx — ô kiểu số lấy GIÁ TRỊ GỐC ==');
  global.XLSX = require('xlsx');
  localStorage.removeItem('he2');
  // Dựng file thật trong bộ nhớ: máy Anh-Mỹ, trộn ô số thật + ô "số dạng chữ"
  const wsT = XLSX.utils.aoa_to_sheet([
    ['Chi tieu', 'Gia tri', 'Ghi chu'],
    ['A',        10000.5,   'so lieu uoc'],   // ô KIỂU SỐ — giá trị gốc
    ['B',        '10.5',    null],            // số dạng chữ, manh mối Anh-Mỹ
    ['C',        '2,000',   'tam tinh'],      // số dạng chữ, mơ hồ
  ]);
  const wbT = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbT, wsT, 'S1');
  const bufT = XLSX.write(wbT, { type: 'array', bookType: 'xlsx' });
  const fileGia = { arrayBuffer: async () => bufT };
  const dong = await UTILS.docExcel(fileGia);
  ok(dong[1][1] === 10000.5 && typeof dong[1][1] === 'number',
     'ô kiểu số → number gốc 10000.5, không qua chuỗi (miễn nhiễm định dạng máy)');
  ok(typeof dong[2][1] === 'string', 'ô "số dạng chữ" giữ là chuỗi để parse');
  ok(localStorage.getItem('he2') === 'us', 'chuỗi trong file ("10.5") → trí nhớ máy = us');
  ok(UTILS.oThanhSo(dong[1][1]) === 10000.5, 'oThanhSo(number) → giữ nguyên');
  ok(UTILS.oThanhSo(dong[2][1]) === 10.5, "oThanhSo('10.5') → 10.5");
  ok(UTILS.oThanhSo(dong[3][1]) === 2000, "oThanhSo('2,000') theo trí nhớ us → 2000");
  ok(UTILS.oThanhSo('10.000') === 10, "'10.000' mơ hồ trên máy đã biết là us → 10");
  ok(UTILS.oThanhSo(null) === null && UTILS.oThanhSo('abc') === null, 'rỗng/chữ → null');

  console.log('== 18. Phát hiện hệ MUỘN → diễn giải lại các ô đã dán trước ==');
  localStorage.removeItem('he2');
  ['i00','i01','i10','i11'].forEach(id => { inp(id).value = ''; delete inp(id).dataset.goc; });
  // Lần dán 1: toàn ô mơ hồ, chưa có trí nhớ → hiểu theo mặc định VN
  UTILS.xuLyPaste({ clipboardData: { getData: () => '10.000\t20.000' }, preventDefault(){} }, inp('i00'));
  ok(inp('i00').value === '10000' && inp('i01').value === '20000',
     'lần dán 1 mơ hồ, chưa trí nhớ → tạm hiểu VN: 10000/20000');
  // Lần dán 2 (hàng dưới): lộ manh mối Anh-Mỹ → ô lần 1 phải được parse LẠI TỪ GỐC
  UTILS.xuLyPaste({ clipboardData: { getData: () => '1,234.5\t3,000' }, preventDefault(){} }, inp('i10'));
  ok(inp('i10').value === '1234.5' && inp('i11').value === '3000', 'lần dán 2 hiểu đúng Anh-Mỹ');
  ok(inp('i00').value === '10' && inp('i01').value === '20',
     'ô lần 1 được diễn giải lại từ chuỗi gốc: 10000/20000 → 10/20');
  ok(document.getElementById('toast').textContent.includes('diễn giải lại 2 ô'),
     'toast cảnh báo nêu rõ số ô đã diễn giải lại + nhắc Lưu lại');
  // Ô người dùng đã SỬA TAY thì không được đụng vào
  inp('i00').value = '99';
  inp('i00').dispatchEvent(new Event('input'));       // mô phỏng gõ tay → bỏ chuỗi gốc
  UTILS.xuLyPaste({ clipboardData: { getData: () => '1.234,5\n' }, preventDefault(){} }, inp('i10'));
  ok(inp('i10').value === '1234.5', 'lần dán 3 "1.234,5" → hiểu đúng VN: 1234.5');
  ok(inp('i00').value === '99', 'ô đã sửa tay giữ nguyên 99 (không bị parse lại)');
  ok(inp('i01').value === '20000', 'ô chưa sửa tay theo hệ VN mới phát hiện: 20 → 20000');
  ok(inp('i11').value === '3', '"3,000" trên máy VN nghĩa là 3 → diễn giải lại đúng');

  console.log('== 19. CHỐT CHẶN CUỐI: hỏi người dùng khi manh mối chưa đủ tin cậy ==');
  // 19a. phanTichHe phát hiện ô mơ hồ rủi ro cao và mâu thuẫn
  ok(UTILS.phanTichHe(['10.000']).coOMoHoRuiRo === true, "'10.000' → cờ ô mơ hồ rủi ro cao");
  ok(UTILS.phanTichHe(['1,234']).coOMoHoRuiRo === true, "'1,234' → cờ ô mơ hồ rủi ro cao");
  ok(UTILS.phanTichHe(['10,5']).coOMoHoRuiRo === false, "'10,5' rõ ràng → không rủi ro");
  ok(UTILS.phanTichHe(['1.234,5', '1,234.5']).mauThuan === true, 'khối vừa VN vừa US → mâu thuẫn');

  // 19b. canHoiNguoiDung: mâu thuẫn → luôn hỏi
  localStorage.removeItem('he2');
  ok(UTILS.canHoiNguoiDung(['1.234,5', '1,234.5']).hoi === true, 'mâu thuẫn → cần hỏi');
  // ô mơ hồ rủi ro cao + chưa biết hệ → hỏi
  ok(UTILS.canHoiNguoiDung(['10.000', '20.000']).hoi === true, 'ô rủi ro + chưa có trí nhớ → cần hỏi');
  // đã có trí nhớ máy → KHÔNG hỏi (dùng lại)
  UTILS.luuHeMay('us');
  ok(UTILS.canHoiNguoiDung(['10.000']).hoi === false, 'ô rủi ro nhưng ĐÃ có trí nhớ → không hỏi');
  localStorage.removeItem('he2');
  // khối tự kết luận được hệ → không hỏi
  ok(UTILS.canHoiNguoiDung(['10.000', '1,234.5']).hoi === false, 'khối tự kết luận us → không hỏi');
  // rõ ràng, không rủi ro → không hỏi
  ok(UTILS.canHoiNguoiDung(['10,5', '20,7']).hoi === false, 'toàn ô rõ ràng → không hỏi');

  // 19c. xuLyPaste GỌI onHoiHe và DỪNG khi cần hỏi (không parse thầm)
  localStorage.removeItem('he2');
  ['i00','i01','i10','i11'].forEach(id => { inp(id).value = ''; delete inp(id).dataset.goc; delete inp(id).dataset.choParse; });
  let daHoi = null;
  UTILS.xuLyPaste(
    { clipboardData: { getData: () => '10.000\t20.000' }, preventDefault(){} },
    inp('i00'),
    { onHoiHe: (pt, lyDo) => { daHoi = { pt, lyDo }; } }
  );
  ok(daHoi && daHoi.lyDo === 'mo_ho_chua_biet', 'khối mơ hồ + chưa biết hệ → gọi onHoiHe (không parse thầm)');
  ok(inp('i00').value === '' && inp('i00').dataset.goc === '10.000' && inp('i00').dataset.choParse === '1',
     'ô đang CHỜ: giữ chuỗi gốc, chưa điền số');

  // 19d. Người dùng chọn hệ → apDungHeChoODan parse các ô đang chờ
  let msgXong = null;
  UTILS._paste = { onXong: (m, t) => { msgXong = { m, t }; } };
  UTILS.apDungHeChoODan('us');
  ok(inp('i00').value === '10' && inp('i01').value === '20', 'chọn Anh-Mỹ → ô chờ parse thành 10/20');
  ok(inp('i00').dataset.choParse === undefined, 'ô hết trạng thái chờ sau khi áp');
  ok(localStorage.getItem('he2') === 'us', 'lựa chọn của người dùng được ghi nhớ cho lần sau');
  ok(msgXong && /Anh-Mỹ/.test(msgXong.m), 'báo kết quả nêu rõ định dạng đã áp');

  // 19e. Nếu người dùng chọn VN thì cùng chuỗi ra kết quả khác
  localStorage.removeItem('he2');
  ['i00','i01'].forEach(id => { inp(id).value = ''; inp(id).dataset.goc = '10.000'; inp(id).dataset.choParse = '1'; });
  UTILS._paste = { onXong: () => {} };
  UTILS.apDungHeChoODan('vn');
  ok(inp('i00').value === '10000' && inp('i01').value === '10000', 'chọn Việt Nam → cùng "10.000" ra 10000');

  console.log('== 20. TẦNG GỢI Ý SQL (cán bộ dùng nhiều máy) ==');
  // Dọn trạng thái: máy MỚI (localStorage rỗng), có gợi ý SQL từ hồ sơ
  localStorage.removeItem('he2');
  UTILS.datHeGoiY(null);

  // 20a. Máy mới + gợi ý SQL='us' + ô AN TOÀN (có thập phân rõ) → áp thẳng, KHÔNG hỏi
  UTILS.datHeGoiY('us');
  let r = UTILS.canHoiNguoiDung(['1234.5', '67.8']);
  ok(r.hoi === false && r.pt.heSuyRa === 'us',
     'máy mới + SQL us + ô an toàn → áp thẳng us, không hỏi');

  // 20b. Máy mới + gợi ý SQL='us' + ô RỦI RO ("10.000") → VẪN hỏi, nhưng nút chọn sẵn us
  r = UTILS.canHoiNguoiDung(['10.000', '20.000']);
  ok(r.hoi === true && r.ly_do === 'mo_ho_chua_biet',
     'máy mới + SQL us + ô rủi ro → VẪN hỏi (SQL không tự quyết ô nguy hiểm)');
  ok(r.heChonSan === 'us', '…nhưng nút được chọn sẵn theo gợi ý SQL (chỉ 1 cú Enter)');
  ok(r.pt.heSuyRa === null, 'heSuyRa=null ở ô rủi ro chỉ có SQL (không áp thầm)');

  // 20c. localStorage LUÔN đứng trên gợi ý SQL (máy đang ngồi thắng)
  UTILS.luuHeMay('vn');           // máy này thực ra là VN
  UTILS.datHeGoiY('us');          // hồ sơ SQL nói us (từ máy khác)
  r = UTILS.canHoiNguoiDung(['10.000']);
  ok(r.hoi === false && r.pt.heSuyRa === 'vn',
     'ô rủi ro nhưng localStorage=vn thắng SQL=us → áp vn, không hỏi');
  ok(r.heChonSan === 'vn', 'nút chọn sẵn ưu tiên localStorage hơn SQL');

  // 20d. Đồng bộ ngược lên SQL khi người dùng xác lập hệ khác gợi ý
  localStorage.removeItem('he2');
  UTILS.datHeGoiY('us');
  ['i00','i01'].forEach(id => { inp(id).value=''; inp(id).dataset.goc='10.000'; inp(id).dataset.choParse='1'; });
  let sqlGhi = null;
  UTILS._paste = { onXong: () => {}, onLuuSQL: (he) => { sqlGhi = he; } };
  UTILS.apDungHeChoODan('vn');    // người dùng chọn VN, khác gợi ý us
  ok(sqlGhi === 'vn', 'chọn hệ khác gợi ý SQL → gọi onLuuSQL ghi ngược lên hồ sơ');
  ok(UTILS.layHeGoiY() === 'vn', 'gợi ý trong phiên cũng cập nhật theo');

  // 20e. KHÔNG ghi SQL thừa khi hệ chọn TRÙNG gợi ý hiện tại
  localStorage.removeItem('he2');
  UTILS.datHeGoiY('vn');
  inp('i00').value=''; inp('i00').dataset.goc='10.000'; inp('i00').dataset.choParse='1';
  sqlGhi = null;
  UTILS._paste = { onXong: () => {}, onLuuSQL: (he) => { sqlGhi = he; } };
  UTILS.apDungHeChoODan('vn');    // trùng gợi ý vn
  ok(sqlGhi === null, 'chọn hệ TRÙNG gợi ý → không ghi SQL thừa');

  // Dọn để không ảnh hưởng test sau
  UTILS.datHeGoiY(null); localStorage.removeItem('he2');

  console.log('== 21. DB tầng SQL: seed khi đăng nhập + luuHeDinhDang ==');
  // 21a. dangNhap trả kèm he_dinh_dang từ hồ sơ
  PHIEN_HIEN_TAI = null;
  PHAN_HOI['ho_so'] = { data: [{ id: 'uuid-123', ho_ten: 'CV', don_vi: 'CC A', vai_tro: 'editor', trang_thai: true, he_dinh_dang: 'us' }] };
  const ndSQL = await DB.dangNhap('cv@snnmt.gov.vn', 'mk');
  ok(ndSQL.he_dinh_dang === 'us', 'dangNhap trả kèm he_dinh_dang từ hồ sơ');

  // 21b. kiemTraDangNhap seed gợi ý vào UTILS
  UTILS.datHeGoiY(null);
  PHIEN_HIEN_TAI = { user: { id: 'uuid-123', email: 'cv@snnmt.gov.vn' } };
  await UTILS.kiemTraDangNhap();
  ok(UTILS.layHeGoiY() === 'us', 'kiemTraDangNhap seed gợi ý SQL vào phiên');

  // 21c. luuHeDinhDang ghi cột đúng, chỉ nhận vn/us
  NHAT_KY.length = 0;
  PHAN_HOI['ho_so'] = { data: [], error: null };
  await DB.luuHeDinhDang('vn');
  const goiHe = timGoi('ho_so').at(-1);
  const opUpd = goiHe.ops.find(o => o[0] === 'update');
  ok(opUpd && opUpd[1].he_dinh_dang === 'vn', 'luuHeDinhDang UPDATE he_dinh_dang=vn');
  ok(goiHe.ops.some(o => o[0] === 'eq' && o[1] === 'id' && o[2] === 'uuid-123'), '…đúng dòng của mình (id uuid)');
  NHAT_KY.length = 0;
  await DB.luuHeDinhDang('bậy');
  ok(timGoi('ho_so').length === 0, 'giá trị lạ → không ghi (bảo vệ CHECK constraint)');

  console.log('== 22. LOCALE ĐẶT TAY + CỜ PHIÊN (dán từ Word/web US trên máy VN) ==');
  const reset = () => {
    localStorage.removeItem('he2'); localStorage.removeItem('he2_tay');
    UTILS.datHeGoiY(null); UTILS.tatAutoDocNguoc();
    ['i00','i01','i10','i11'].forEach(id => { inp(id).value=''; delete inp(id).dataset.goc; delete inp(id).dataset.choParse; });
  };

  // 22a. Đặt tay VN → locale đặt tay là điểm neo
  reset(); UTILS.luuHeDatTay('vn');
  ok(UTILS.layHeDatTay() === 'vn', 'luuHeDatTay ghi locale máy');
  ok(localStorage.getItem('he2') === 'vn', '…đồng thời là trí nhớ máy hiện hành');

  // 22b. Máy VN + khối MƠ HỒ ("10.000") → đọc theo cài đặt VN, KHÔNG hỏi
  reset(); UTILS.luuHeDatTay('vn');
  r = UTILS.canHoiNguoiDung(['10.000', '20.000']);
  ok(r.hoi === false && r.pt.heSuyRa === 'vn', 'máy VN + ô mơ hồ → đọc VN, không hỏi');

  // 22c. Máy VN + khối US RÕ ("1,234.5") → XUNG ĐỘT → HỎI (không tự lật)
  reset(); UTILS.luuHeDatTay('vn');
  r = UTILS.canHoiNguoiDung(['1,234.5', '2,000.75']);
  ok(r.hoi === true && r.ly_do === 'xung_dot_cai_tay', 'máy VN + khối US rõ → hỏi (xung đột cài tay)');
  ok(r.pt.he === 'us' && r.pt.heTay === 'vn', 'pt nêu rõ khối=us, cài=vn để hộp hỏi hiển thị');

  // 22d. Lối "chỉ đọc lần này theo US" → GIỮ cài đặt VN
  reset(); UTILS.luuHeDatTay('vn');
  inp('i00').dataset.goc='1,234.5'; inp('i00').dataset.choParse='1';
  UTILS._paste = { onXong:()=>{}, heKhoi:'us', heTay:'vn' };
  UTILS.locChiLanNay();
  ok(inp('i00').value === '1234.5', 'chỉ-lần-này: đọc "1,234.5" theo US → 1234.5');
  ok(UTILS.layHeDatTay() === 'vn' && localStorage.getItem('he2') === 'vn', '…GIỮ nguyên cài đặt máy = VN');

  // 22e. Lối "đổi cài đặt sang US" → ghi locale đặt tay mới
  reset(); UTILS.luuHeDatTay('vn');
  inp('i00').dataset.goc='1,234.5'; inp('i00').dataset.choParse='1';
  UTILS._paste = { onXong:()=>{}, heKhoi:'us', heTay:'vn' };
  UTILS.locDoiCaiDat();
  ok(inp('i00').value === '1234.5', 'đổi-cài-đặt: đọc theo US → 1234.5');
  ok(UTILS.layHeDatTay() === 'us', '…locale máy ĐỔI sang US');

  // 22f. Lối "đừng hỏi lại trong phiên" → bật cờ, giữ cài đặt VN
  reset(); UTILS.luuHeDatTay('vn');
  inp('i00').dataset.goc='1,234.5'; inp('i00').dataset.choParse='1';
  UTILS._paste = { onXong:()=>{}, heKhoi:'us', heTay:'vn' };
  UTILS.locDungHoiTrongPhien();
  ok(UTILS.layAutoDocNguoc() === 'us', 'bật cờ phiên tự đọc US');
  ok(UTILS.layHeDatTay() === 'vn', '…cài đặt máy vẫn VN (cờ chỉ trong phiên)');

  // 22g. Cờ phiên đang bật + khối US rõ tiếp theo → tự đọc, KHÔNG hỏi
  r = UTILS.canHoiNguoiDung(['5,678.9']);
  ok(r.hoi === false && r.apDung === 'us', 'cờ bật + khối US rõ → tự đọc US, không hỏi');

  // 22h. Cờ phiên đang bật + ô MƠ HỒ "10.000" → KHÔNG được nuốt (vẫn VN)
  //      (ranh giới an toàn: cờ chỉ tự xử manh mối US RÕ, không đụng ô mơ hồ)
  r = UTILS.canHoiNguoiDung(['10.000']);
  ok(r.hoi === false && r.pt.heSuyRa === 'vn' && r.apDung === undefined,
     'cờ bật nhưng ô mơ hồ "10.000" trên máy VN vẫn = mười nghìn (không nuốt)');

  // 22i. Cờ phiên đang bật + khối VN RÕ (Excel chuẩn) → HỎI LẠI (quy tắc tối cao)
  r = UTILS.canHoiNguoiDung(['1.234,5']);
  ok(r.hoi === true && r.ly_do === 'auto_gap_nguoc',
     'cờ đang đọc US, gặp khối VN rõ → HỎI LẠI, không im lặng');

  // 22j. Xác nhận "chuyển về đọc theo máy" → TẮT cờ phiên
  reset(); UTILS.luuHeDatTay('vn'); UTILS.batAutoDocNguoc('us');
  inp('i00').dataset.goc='1.234,5'; inp('i00').dataset.choParse='1';
  UTILS._paste = { onXong:()=>{}, he:'vn', heTay:'vn' };
  UTILS.locChuyenVeMay();
  ok(UTILS.layAutoDocNguoc() === null, 'chuyển về máy → cờ phiên tắt');
  ok(inp('i00').value === '1234.5', '…đọc "1.234,5" theo VN → 1234.5');

  // 22k. Xung đột nhưng cờ phiên đã bật đúng chiều → im lặng đọc theo khối
  reset(); UTILS.luuHeDatTay('vn'); UTILS.batAutoDocNguoc('us');
  r = UTILS.canHoiNguoiDung(['9,999.5']);
  ok(r.hoi === false && r.apDung === 'us', 'đã bật cờ US: khối US rõ tiếp theo không hỏi lại nữa');

  reset();
  console.log('\n══════════════════════════════════');
  console.log(`KET QUA: ${dat} DAT, ${truot} TRUOT / ${dat + truot} kiem tra`);
  process.exit(truot ? 1 : 0);
})().catch(e => { console.error('LOI TEST:', e); process.exit(1); });
