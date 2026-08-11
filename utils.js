// ============================================================
// UTILS.JS — HÀM TIỆN ÍCH DÙNG CHUNG
// ============================================================

const UTILS = {

  // ── SESSION ─────────────────────────────────────────────
  laySession() {
    try { return JSON.parse(localStorage.getItem('u')); } catch { return null; }
  },
  luuSession(user) { localStorage.setItem('u', JSON.stringify(user)); },
  xoaSession()     { localStorage.removeItem('u'); },

  // ── TOAST ───────────────────────────────────────────────
  _toastTimer: null,
  toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast on ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
  },

  // ── MODAL ───────────────────────────────────────────────
  moModal(id)   { document.getElementById(id)?.classList.add('on'); },
  dongModal(id) { document.getElementById(id)?.classList.remove('on'); },

  // ── DOM ─────────────────────────────────────────────────
  bat(id) { document.getElementById(id)?.classList.add('on'); },
  tat(id) { document.getElementById(id)?.classList.remove('on'); },
  el(id)  { return document.getElementById(id); },

  // ── XÁC NHẬN ────────────────────────────────────────────
  xacNhan(title, msg, callback) {
    UTILS.el('xn-title').textContent = title;
    UTILS.el('xn-msg').innerHTML = msg;
    UTILS.el('xn-ok').onclick = () => { UTILS.dongModal('modal-xn'); callback(); };
    UTILS.moModal('modal-xn');
  },

  // ── SỐ LIỆU ─────────────────────────────────────────────
  // Làm sạch chuỗi số — xử lý an toàn cả hai hệ (VN và quốc tế):
  //   "10.000"   → 10000  (chấm là phân cách hàng nghìn VN)
  //   "10.5"     → 10.5   (chấm là thập phân kiểu quốc tế)
  //   "10.000,5" → 10000.5
  //   "10,5"     → 10.5   (phẩy là thập phân VN)
  //   "10,000.5" → 10000.5 (định dạng Anh/Mỹ)
  parseSo(str) {
    if (str === '' || str === null || str === undefined) return null;
    const s = String(str).trim();
    if (s === '') return null;

    const hasDot   = s.includes('.');
    const hasComma = s.includes(',');

    let normalized;
    if (hasDot && hasComma) {
      // Cả hai dấu → xác định thứ tự: dấu nào xuất hiện SAU là thập phân
      const lastDot   = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) {
        // Kiểu VN: 10.000,50 → bỏ chấm, đổi phẩy thành chấm
        normalized = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Kiểu Anh/Mỹ: 10,000.50 → bỏ phẩy
        normalized = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      // Chỉ có phẩy
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // "10,5" hoặc "10,50" → thập phân VN
        normalized = s.replace(',', '.');
      } else {
        // "10,000" → phân cách hàng nghìn → bỏ phẩy
        normalized = s.replace(/,/g, '');
      }
    } else if (hasDot && !hasComma) {
      // Chỉ có chấm
      const parts = s.split('.');
      const lastPart = parts[parts.length - 1];
      if (parts.length === 2 && lastPart.length !== 3) {
        // "10.5" hoặc "10.50" → thập phân quốc tế
        normalized = s;
      } else {
        // "10.000" hoặc "1.000.000" → phân cách hàng nghìn VN → bỏ chấm
        normalized = s.replace(/\./g, '');
      }
    } else {
      // Không có dấu gì
      normalized = s;
    }

    const n = parseFloat(normalized);
    return isNaN(n) ? null : n;
  },

  // Format số hiển thị chuẩn vi-VN:
  //   10000     → "10.000"
  //   10000.4   → "10.000,4"
  //   10000.45  → "10.000,45"
  //   10000.456 → "10.000,46" (làm tròn 2 thập phân)
  //   Không có thập phân → không hiện phần thập phân
  formatSo(n) {
    if (n === null || n === undefined || n === '') return '';
    const num = Number(n);
    if (isNaN(num)) return String(n);
    // Xác định số chữ số thập phân thực tế (tối đa 2)
    const decimals = Math.min(
      (String(Math.round(num * 100) / 100).split('.')[1] || '').length,
      2
    );
    return num.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  },

  // ── INDENT ──────────────────────────────────────────────
  demKhoang(str) {
    const m = str.match(/^(\s+)/);
    return m ? m[1].length : 0;
  },

  // ── EXPORT EXCEL ────────────────────────────────────────
  // Xuất bảng nhập liệu ra Excel (dùng SheetJS nếu có, fallback CSV)
  xuatExcel(tenFile, headers, rows) {
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bieu mau');
      // Style header
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: '1B4332' } } };
      }
      XLSX.writeFile(wb, tenFile + '.xlsx');
    } else {
      // Fallback: xuất CSV
      const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = tenFile + '.csv';
      a.click();
    }
  },

  // ── PASTE TỪ EXCEL ──────────────────────────────────────
  // (Bước 7) Hàm UTILS.xuLyPaste cũ đã bị XÓA HẲN. Nó không được nơi nào gọi,
  // dùng một selector ô số không tồn tại trong dự án, và chứa công thức sai
  // kinh điển replace(/\./g,'').replace(',','.') — thứ biến "10.5" thành 105.
  // Đường dán chính thức nằm ở APP.handlePaste (index.html) + UTILS.HE bên dưới.
};

// ============================================================
// UTILS.HE — HỆ ĐỊNH DẠNG SỐ CỦA MÁY (VN 1.234,5  ·  Anh-Mỹ 1,234.5)
// ------------------------------------------------------------
// Bối cảnh: một cán bộ thường dùng 3 máy (laptop, máy cơ quan, máy nhà) và mỗi
// máy có thể đặt Region khác nhau. Định dạng số là thuộc tính của MÁY, không
// phải của người — nên trí nhớ nằm ở localStorage của từng máy, KHÔNG gắn theo
// tài khoản (máy để bàn cơ quan có thể nhiều người dùng chung).
//
// Thứ bậc quyết định (trên thắng dưới):
//   1. Manh mối rõ trong cả khối dán — nhưng nếu ngược hệ ĐẶT TAY thì HỎI.
//   2. Cờ phiên "đừng hỏi lại" (nếu đang bật, đúng chiều).
//   3. Hệ ĐẶT TAY (người tự khai, bền, manh mối không được ghi đè).
//   4. Trí nhớ TỰ SUY (máy tự học, manh mối mới ghi đè được).
//   5. Hệ đo được từ trình duyệt (Intl) — chỉ dùng cho khối AN TOÀN.
//   6. Hỏi người dùng / mặc định VN.
// ============================================================
UTILS.HE = {
  K_TAY:  'nhapso_he_tay',    // hệ đặt tay — bền, cấp máy
  K_AUTO: 'nhapso_he',        // trí nhớ tự suy — bền, cấp máy
  MAC_DINH: 'vn',

  // Cờ phiên: "trong phiên này cứ đọc theo hệ X khi gặp manh mối X, đừng hỏi".
  // Sống trong bộ nhớ, mất khi đóng tab. KHÔNG bao giờ vào localStorage.
  _coPhien: null,

  _hopLe(h) { return (h === 'vn' || h === 'us') ? h : null; },

  // ── Tầng 0 — đo hệ định dạng của CHÍNH MÁY đang ngồi qua Intl ──
  // Lưu ý mức tin cậy: Intl phản ánh ngôn ngữ/vùng của TRÌNH DUYỆT, còn chuỗi
  // copy từ Excel theo Region của WINDOWS. Hai thứ này thường trùng nhưng không
  // bắt buộc trùng, nên kết quả ở đây chỉ là GỢI Ý: dùng cho khối an toàn và để
  // chọn sẵn nút trong hộp hỏi, KHÔNG tự quyết ở ô rủi ro cao (10.000 / 1,234).
  heTrinhDuyet() {
    try {
      const s = new Intl.NumberFormat().format(1234.5);
      const iD = s.lastIndexOf('.'), iC = s.lastIndexOf(',');
      if (iD >= 0 && iC >= 0) return iC > iD ? 'vn' : 'us';
      if (iC >= 0) return 'vn';   // "1 234,5" — phẩy là thập phân
      if (iD >= 0) return 'us';   // "1,234.5" / "1234.5" — chấm là thập phân
      return null;                // chữ số không phải Ả Rập — không kết luận
    } catch { return null; }
  },

  // ── Bộ nhớ ──
  layHeTay()   { try { return this._hopLe(localStorage.getItem(this.K_TAY)); }  catch { return null; } },
  layHeAuto()  { try { return this._hopLe(localStorage.getItem(this.K_AUTO)); } catch { return null; } },
  luuHeTay(h)  { if (!this._hopLe(h)) return; try { localStorage.setItem(this.K_TAY, h); }  catch {} },
  luuHeAuto(h) { if (!this._hopLe(h)) return; try { localStorage.setItem(this.K_AUTO, h); } catch {} },
  xoaHeTay()   { try { localStorage.removeItem(this.K_TAY); } catch {} },

  // Hệ đang có hiệu lực + nguồn gốc của nó (để hiện lên thanh công cụ)
  heDangDung() {
    return this.layHeTay() || this.layHeAuto() || this.heTrinhDuyet() || this.MAC_DINH;
  },
  nguonHe() {
    if (this.layHeTay())  return 'tay';
    if (this.layHeAuto()) return 'auto';
    if (this.heTrinhDuyet()) return 'may';
    return 'macdinh';
  },
  moTaNguon(n) {
    return { tay: 'do bạn đặt cho máy này',
             auto: 'máy tự nhận ra từ dữ liệu đã dán',
             may: 'theo cài đặt của trình duyệt',
             macdinh: 'mặc định' }[n || this.nguonHe()] || '';
  },
  tenHe(h) { return h === 'us' ? 'Anh-Mỹ (1,234.5)' : 'Việt Nam (1.234,5)'; },
  tenHeNgan(h) { return h === 'us' ? 'Anh-Mỹ' : 'Việt Nam'; },

  // ── Tầng 2 — phân tích manh mối trên CẢ KHỐI, không đoán từng ô ──
  phanTichHe(dsChuoi) {
    let vn = 0, us = 0, moHo = 0;
    for (const raw of dsChuoi || []) {
      const s = String(raw === null || raw === undefined ? '' : raw).trim();
      if (!/\d/.test(s)) continue;
      const hasDot = s.includes('.'), hasComma = s.includes(',');
      if (hasDot && hasComma) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) vn++; else us++;
      } else if (hasComma) {
        const p = s.split(',');
        if (p.length === 2 && p[1].length <= 2) vn++;              // "10,5"
        else if (p.length >= 3) us++;                              // "1,234,567"
        else if (p.length === 2 && p[1].length === 3) moHo++;      // "1,234" — RỦI RO
      } else if (hasDot) {
        const p = s.split('.');
        if (p.length === 2 && p[1].length !== 3) us++;             // "10.5"
        else if (p.length >= 3) vn++;                              // "1.234.567"
        else if (p.length === 2 && p[1].length === 3) moHo++;      // "10.000" — RỦI RO
      }
    }
    let he = null;
    if (vn && !us) he = 'vn'; else if (us && !vn) he = 'us';
    return { he, soVN: vn, soUS: us, soMoHo: moHo,
             mauThuan: vn > 0 && us > 0, coOMoHoRuiRo: moHo > 0 };
  },

  // ── Quyết định: áp thẳng hay dừng lại HỎI ──
  // Trả về { hanhDong:'ap'|'hoi', he, lyDo, ghiNho, heChonSan, heTay, pt }
  quyetDinhHe(dsChuoi) {
    const pt = this.phanTichHe(dsChuoi);
    const heTay = this.layHeTay(), heAuto = this.layHeAuto(), heMay = this.heTrinhDuyet();
    const goiY = heTay || heAuto || heMay || this.MAC_DINH;
    const co = pt.he;   // manh mối rõ của cả khối

    // (1) Trong cùng một khối vừa có manh mối VN vừa có manh mối Anh-Mỹ →
    //     một máy không thể cùng lúc hai hệ, luôn hỏi.
    if (pt.mauThuan)
      return { hanhDong: 'hoi', lyDo: 'mau_thuan', he: null, heChonSan: goiY, heTay, pt };

    if (co) {
      // (2) Cờ phiên đang bật nhưng khối này manh mối NGƯỢC → tắt cờ và hỏi lại.
      //     Im lặng đổi cách đọc giữa chừng là thứ khó phát hiện nhất khi soát số.
      if (this._coPhien && this._coPhien !== co) {
        this._coPhien = null;
        return { hanhDong: 'hoi', lyDo: 'co_phien_nguoc', he: co, heChonSan: co, heTay, pt };
      }
      // (3) Cờ phiên đúng chiều → đọc thẳng, giữ nguyên cài đặt máy.
      if (this._coPhien === co)
        return { hanhDong: 'ap', lyDo: 'co_phien', he: co, ghiNho: false, heTay, pt };
      // (4) Manh mối ngược hệ ĐẶT TAY → HỎI, tuyệt đối không tự lật cài đặt.
      if (heTay && co !== heTay)
        return { hanhDong: 'hoi', lyDo: 'xung_dot_tay', he: co, heChonSan: co, heTay, pt };
      // (5) Manh mối rõ, không xung đột → áp và ghi vào trí nhớ tự suy.
      return { hanhDong: 'ap', lyDo: 'manh_moi', he: co, ghiNho: true, heTay, pt };
    }

    // Không có manh mối nào trong khối
    if (pt.coOMoHoRuiRo) {
      // RANH GIỚI AN TOÀN: cờ phiên KHÔNG được nuốt ô mơ hồ "10.000". Trên máy
      // đặt VN thì "10.000" vẫn là mười nghìn, dù đang đọc một xấp số Anh-Mỹ.
      if (heTay)  return { hanhDong: 'ap', lyDo: 'he_tay',  he: heTay,  ghiNho: false, heTay, pt };
      if (heAuto) return { hanhDong: 'ap', lyDo: 'tri_nho', he: heAuto, ghiNho: false, heTay, pt };
      // Máy chưa biết gì + có ô lệch được NGHÌN LẦN → dừng lại hỏi, không đoán thầm.
      return { hanhDong: 'hoi', lyDo: 'mo_ho_chua_biet', he: null, heChonSan: heMay || this.MAC_DINH, heTay, pt };
    }
    // Khối toàn ô an toàn (sai cũng chỉ lệch nhỏ và nhìn là thấy) → không làm phiền.
    return { hanhDong: 'ap', lyDo: 'an_toan', he: goiY, ghiNho: false, heTay, pt };
  },

  // ── Parse theo hệ đã biết. he không hợp lệ → rơi về UTILS.parseSo (tự đoán) ──
  parseSoTheoHe(str, he) {
    if (str === '' || str === null || str === undefined) return null;
    const s = String(str).trim();
    if (s === '') return null;
    let n;
    if (he === 'vn')      n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (he === 'us') n = parseFloat(s.replace(/,/g, ''));
    else                  return UTILS.parseSo(s);
    return isNaN(n) ? null : n;
  },

  // ── Một ô bất kỳ về số: number giữ nguyên (giá trị gốc .xlsx — Tầng 1) ──
  oThanhSo(v, he) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number')  return isNaN(v) ? null : v;
    if (typeof v === 'boolean') return null;
    return this.parseSoTheoHe(v, he);
  },
};
