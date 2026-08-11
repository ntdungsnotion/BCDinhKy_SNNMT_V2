// ============================================================
// CONGTHUC.JS — BỘ MÁY CÔNG THỨC CHỈ TIÊU TỔNG
// Dùng chung cho index.html (nhập liệu), xembaocao.html, admin.html
// Yêu cầu: config.js + db.js được nạp trước
//
// Nguyên tắc:
//   • Biểu thức CHỈ chấp nhận: mã chỉ tiêu + dấu "+" / "−"
//     (tokenize theo whitelist ký tự — KHÔNG dùng eval)
//   • Cho phép công thức lồng nhau (TS55.1 = TS55.2 + TS55.5)
//     → giải bằng đệ quy có ghi nhớ + phát hiện vòng lặp
//   • Ô có công thức bị KHÓA nhập tay ở mọi nơi
// ============================================================

const CT = {

  // ── 1. TÁCH BIỂU THỨC ───────────────────────────────────
  // "TT7 + TT43 - TT9" → { terms:[{ma:'TT7',dau:1},{ma:'TT43',dau:1},{ma:'TT9',dau:-1}], loi:null }
  tach(bieuThuc) {
    // Chuẩn hoá các loại dấu trừ/cộng lạ hay gặp khi copy từ Word/Excel
    const s = String(bieuThuc || '')
      .replace(/[\u2212\u2013\u2014\uFF0D]/g, '-')   // − – — －
      .replace(/[\uFF0B]/g, '+')                      // ＋
      .replace(/\s+/g, '');

    if (!s) return { terms: [], loi: 'Biểu thức rỗng.' };

    const terms = [];
    let dau = 1, buf = '';
    const chot = () => { if (buf) { terms.push({ ma: buf, dau }); buf = ''; } };

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '+' || ch === '-') {
        if (!buf) return { terms: [], loi: `Dấu "${ch}" đặt sai vị trí (vị trí ${i + 1}).` };
        chot();
        dau = (ch === '+') ? 1 : -1;
        continue;
      }
      // Whitelist: chữ cái ASCII, chữ số, dấu chấm, gạch dưới (đủ cho TT4.1, CN36.1, TS55.1…)
      if (!/[A-Za-z0-9._]/.test(ch)) {
        return { terms: [], loi: `Ký tự không hợp lệ: "${ch}". Chỉ cho phép mã chỉ tiêu và dấu + −.` };
      }
      buf += ch;
    }
    if (!buf) return { terms: [], loi: 'Biểu thức kết thúc bằng dấu + hoặc −.' };
    chot();
    return { terms, loi: null };
  },

  // Ghép ngược lại thành chuỗi đẹp để hiển thị tooltip
  vietLai(terms) {
    return terms.map((t, i) => (i === 0 ? '' : (t.dau < 0 ? ' − ' : ' + ')) + t.ma).join('');
  },

  // ── 2. CHUẨN BỊ / KIỂM TRA CÔNG THỨC CỦA MỘT BẢNG ───────
  // dsCT       : các dòng lấy từ bảng cong_thuc_chi_tieu (đã lọc theo bảng)
  // dsChiTieu  : danh sách chỉ tiêu của bảng (để đối chiếu mã)
  // → { map, order, loi[], canhBao[] }
  //   map   : { id → {id, bieuThuc, terms, loaiTru:Set, hienThi} }
  //   order : mảng id đã sắp thứ tự tính (phụ thuộc tính trước)
  chuanBi(dsCT, dsChiTieu) {
    const map = {}, loi = [], canhBao = [];
    const byId = {};
    (dsChiTieu || []).forEach(c => { byId[c.id] = c; });

    (dsCT || []).forEach(r => {
      if (r.hien_thi === false) return;
      const id = String(r.id_chi_tieu || '').trim();
      if (!id) return;

      const t = this.tach(r.bieu_thuc);
      if (t.loi) { loi.push(`${id}: ${t.loi}`); return; }

      let hong = false;
      const dich = byId[id];
      if (!dich)                       { loi.push(`${id}: không có chỉ tiêu này trong bảng.`); hong = true; }
      else if (dich.la_tieu_de)        { loi.push(`${id}: là dòng tiêu đề nhóm, không thể gán công thức.`); hong = true; }
      else if (dich.kieu_du_lieu === 'text') { loi.push(`${id}: là chỉ tiêu dạng văn bản, không cộng được.`); hong = true; }

      const daGap = new Set();
      t.terms.forEach(x => {
        if (x.ma === id)          { loi.push(`${id}: tự tham chiếu chính nó.`); hong = true; }
        else if (!byId[x.ma])     { loi.push(`${id}: mã "${x.ma}" không có trong bảng.`); hong = true; }
        else if (byId[x.ma].la_tieu_de) canhBao.push(`${id}: "${x.ma}" là dòng tiêu đề nhóm (thường không có số).`);
        if (daGap.has(x.ma))      canhBao.push(`${id}: mã "${x.ma}" xuất hiện nhiều lần.`);
        daGap.add(x.ma);
      });
      if (hong) return;   // công thức sai → bỏ qua, ô trở lại chế độ nhập tay

      map[id] = {
        id,
        idDb: r.id,
        bieuThuc: this.vietLai(t.terms),
        terms: t.terms,
        loaiTru: this._tachLoaiTru(r.loai_ky_loai_tru),
        ghiChu: r.ghi_chu || '',
      };
    });

    // ── Phát hiện vòng lặp + sắp thứ tự tính (DFS hậu thứ tự) ──
    const viPham = new Set();
    const sapXep = () => {
      const order = [], trangThai = {};   // 1 = đang xét, 2 = xong
      const duyet = (id, duong) => {
        if (trangThai[id] === 2) return;
        if (trangThai[id] === 1) {
          const seg = duong.slice(duong.indexOf(id)).concat(id);
          loi.push(`Vòng lặp công thức: ${seg.join(' → ')}`);
          seg.forEach(x => viPham.add(x));
          return;
        }
        trangThai[id] = 1;
        (map[id].terms || []).forEach(t => { if (map[t.ma]) duyet(t.ma, duong.concat(id)); });
        trangThai[id] = 2;
        order.push(id);
      };
      Object.keys(map).forEach(id => duyet(id, []));
      return order;
    };

    let order = sapXep();
    // Có vòng lặp → gỡ toàn bộ công thức nằm trong vòng (các ô đó trở lại nhập tay)
    if (viPham.size) {
      viPham.forEach(id => { delete map[id]; });
      order = sapXep();
    }

    return { map, order: order.filter(id => map[id]), loi, canhBao };
  },

  _tachLoaiTru(s) {
    const out = new Set();
    String(s || '').split(',').forEach(x => {
      const v = x.trim().toLowerCase();
      if (v) out.add(v);
    });
    return out;
  },

  // Công thức này có áp dụng cho kỳ đang xét không?
  apDungChoKy(ctItem, kyObj) {
    if (!ctItem || !ctItem.loaiTru || !ctItem.loaiTru.size) return true;
    const loai = String(kyObj?.loai_so_lieu || '').trim().toLowerCase();
    return !ctItem.loaiTru.has(loai);
  },

  // ── 3. TÍNH GIÁ TRỊ CHO MỘT KỲ ──────────────────────────
  // prep    : kết quả chuanBi()
  // kyObj   : object kỳ báo cáo (để xét loại trừ)
  // layGoc  : (idChiTieu) → number | null  — giá trị NHẬP TAY của chỉ tiêu đó ở kỳ này
  // → { vals: {id: number|null}, thieu: {id: [mã thiếu…]} }
  tinhChoKy(prep, kyObj, layGoc) {
    const vals = {}, thieu = {};
    if (!prep || !prep.order) return { vals, thieu };

    prep.order.forEach(id => {
      const it = prep.map[id];
      if (!it) return;
      if (!this.apDungChoKy(it, kyObj)) { vals[id] = undefined; return; }  // undefined = không áp dụng

      let tong = 0, coSo = false;
      const missing = [];
      it.terms.forEach(t => {
        // Là công thức đã tính ở bước trước → dùng kết quả; nếu công thức đó bị
        // loại trừ ở kỳ này (undefined) thì quay về lấy số nhập tay.
        let v = (Object.prototype.hasOwnProperty.call(vals, t.ma) && vals[t.ma] !== undefined)
                  ? vals[t.ma] : layGoc(t.ma);
        if (v === null || v === undefined || v === '' || isNaN(Number(v))) { missing.push(t.ma); return; }
        tong += t.dau * Number(v);
        coSo = true;
      });
      // Không có bất kỳ số hạng nào có số liệu → để trống (không hiện 0)
      vals[id] = coSo ? Math.round(tong * 1e6) / 1e6 : null;
      thieu[id] = missing;
    });
    return { vals, thieu };
  },

  // ── 4. ÁP CÔNG THỨC LÊN BẢN ĐỒ SỐ LIỆU (dùng cho xembaocao / xuất Excel) ──
  // idx     : { "idChiTieu|maKy" → row }  (sửa trực tiếp)
  // dsKyObj : mảng object kỳ báo cáo cần áp dụng
  // → { soODaSua, soOLech }
  apDungVaoIdx(idx, prep, dsKyObj) {
    let soODaSua = 0, soOLech = 0;
    if (!prep || !prep.order || !prep.order.length) return { soODaSua, soOLech };

    (dsKyObj || []).forEach(k => {
      const ky = k.ky_bao_cao;
      const kq = this.tinhChoKy(prep, k, id => {
        const r = idx[`${id}|${ky}`];
        const v = r ? r.gia_tri : null;
        return (v === null || v === undefined || v === '') ? null : Number(v);
      });
      Object.keys(kq.vals).forEach(id => {
        const v = kq.vals[id];
        if (v === undefined) return;                 // kỳ bị loại trừ → giữ nguyên số nhập tay
        const key = `${id}|${ky}`;
        const cu = idx[key] ? idx[key].gia_tri : null;
        const cuN = (cu === null || cu === undefined || cu === '') ? null : Number(cu);
        if (!idx[key]) idx[key] = { id_chi_tieu: id, ky_bao_cao: ky };
        idx[key].gia_tri = v;
        idx[key]._ct = true;
        idx[key]._ctCu = cuN;
        idx[key]._ctThieu = kq.thieu[id] || [];
        soODaSua++;
        const lech = (cuN === null && v !== null) || (cuN !== null && v === null) ||
                     (cuN !== null && v !== null && Math.abs(cuN - v) > 1e-6);
        if (lech) soOLech++;
      });
    });
    return { soODaSua, soOLech };
  },

  // ── 5. NẠP CÔNG THỨC CỦA MỘT BẢNG (chịu lỗi: chưa tạo bảng SQL vẫn chạy) ──
  async nap(maBang, dsChiTieu) {
    let ds = [];
    try { ds = await DB.layCongThuc(maBang); }
    catch (e) { console.warn('[CT] Chưa dùng được bảng công thức:', e.message); ds = []; }
    return this.chuanBi(ds, dsChiTieu);
  },

  // Văn bản tooltip nhắc người dùng
  moTa(prep, id, tenTheoMa) {
    const it = prep && prep.map ? prep.map[id] : null;
    if (!it) return '';
    const ve = it.terms.map((t, i) =>
      (i === 0 ? '' : (t.dau < 0 ? ' − ' : ' + ')) + t.ma
    ).join('');
    let s = `🔒 Ô tự động — không nhập tay\n${id} = ${ve}`;
    if (typeof tenTheoMa === 'function') {
      const dong = it.terms.map(t => `  ${t.dau < 0 ? '−' : '+'} ${t.ma}  ${tenTheoMa(t.ma) || ''}`).join('\n');
      if (dong) s += '\n' + dong;
    }
    if (it.ghiChu) s += '\n(' + it.ghiChu + ')';
    return s;
  },
};
