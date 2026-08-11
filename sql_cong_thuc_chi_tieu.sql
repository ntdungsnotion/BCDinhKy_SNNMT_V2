-- ============================================================
-- BẢNG CÔNG THỨC CHỈ TIÊU TỔNG
-- Chạy 1 lần trong Supabase SQL Editor
--
-- Ô có công thức sẽ bị KHÓA nhập tay ở trang nhập liệu (index.html)
-- và được tính lại khi hiển thị ở trang xem báo cáo (xembaocao.html).
-- Quản lý tại admin.html → mục "🧮 Công thức".
-- ============================================================

create table if not exists public.cong_thuc_chi_tieu (
  id                bigint generated always as identity primary key,
  bang              text not null,                 -- mã bảng (danh_sach_bang.bang)
  id_chi_tieu       text not null,                 -- chỉ tiêu ĐÍCH (ô sẽ bị khóa)
  bieu_thuc         text not null,                 -- vd: 'TT7+TT43+TT77+TT115'
  loai_ky_loai_tru  text default 'So cùng kỳ',     -- các loai_so_lieu KHÔNG áp dụng
                                                   -- (ngăn cách bằng dấu phẩy; để trống = áp dụng mọi kỳ)
  hien_thi          boolean default true,          -- tắt tạm công thức mà không cần xóa
  ghi_chu           text,
  ngay_tao          timestamptz default now(),
  unique (id_chi_tieu)
);

comment on table public.cong_thuc_chi_tieu is
  'Công thức chỉ tiêu tổng. Chỉ chấp nhận mã chỉ tiêu nối bằng dấu + và −. Ô đích bị khóa nhập tay.';
comment on column public.cong_thuc_chi_tieu.loai_ky_loai_tru is
  'Kỳ có loai_so_lieu nằm trong danh sách này sẽ KHÔNG áp công thức (ô trở lại nhập tay). Mặc định loại trừ "So cùng kỳ" vì kỳ này thường lưu tỷ lệ %, cộng lại sẽ vô nghĩa. Nếu kỳ So cùng kỳ của bạn lưu SỐ TUYỆT ĐỐI thì hãy xóa trống ô này.';

create index if not exists idx_cong_thuc_bang on public.cong_thuc_chi_tieu (bang);

-- Khóa ngoại tới chi_tieu (bỏ qua nếu chi_tieu.id không phải khóa chính/unique)
do $$
begin
  alter table public.cong_thuc_chi_tieu
    add constraint fk_cong_thuc_chi_tieu
    foreign key (id_chi_tieu) references public.chi_tieu(id)
    on delete cascade on update cascade;
exception when others then
  raise notice 'Bỏ qua khóa ngoại tới chi_tieu: %', sqlerrm;
end $$;

-- ── RLS: cùng mô hình với cau_hinh_so_sanh ──
alter table public.cong_thuc_chi_tieu enable row level security;

drop policy if exists "Cho phep doc cong thuc" on public.cong_thuc_chi_tieu;
create policy "Cho phep doc cong thuc"
  on public.cong_thuc_chi_tieu for select using (true);

drop policy if exists "Admin quan ly cong thuc" on public.cong_thuc_chi_tieu;
create policy "Admin quan ly cong thuc"
  on public.cong_thuc_chi_tieu for all using (true) with check (true);


-- ============================================================
-- NẠP SẴN CÁC CÔNG THỨC ĐÃ CHỐT
-- Cột "bang" tự lấy từ bảng chi_tieu nên không cần gõ tay mã bảng.
-- Dòng nào có mã chỉ tiêu chưa tồn tại sẽ tự bị bỏ qua (không báo lỗi).
-- Chạy lại nhiều lần vẫn an toàn (ghi đè biểu thức cũ).
-- ============================================================
insert into public.cong_thuc_chi_tieu (bang, id_chi_tieu, bieu_thuc)
select c.bang, v.id, v.bt
from (values
  -- ── Trồng trọt và Bảo vệ thực vật ──
  ('TT4.1',   'TT7+TT43+TT77+TT115+TT133+TT149+TT155+TT183'),
  ('TT4.2',   'TT10+TT47+TT80+TT136+TT152+TT158+TT186'),
  ('TT261.2', 'TT269+TT275+TT282+TT289+TT296+TT303'),
  ('TT261.3', 'TT273+TT279+TT286+TT293+TT300+TT307'),
  ('TT263.1', 'TT269+TT275+TT282+TT289+TT296'),
  ('TT267.1', 'TT273+TT279+TT286+TT293+TT300'),
  -- ── Chăn nuôi ──
  ('CN36.1',  'CN37+CN38+CN39+CN40+CN41'),
  ('CN16.1',  'CN17+CN18'),
  -- ── Thủy sản và Kiểm ngư ──
  ('TS55.1',  'TS34+TS59+TS61+TS63+TS64+TS66'),
  ('TS55.2',  'TS34'),
  ('TS55.3',  'TS35'),
  ('TS55.4',  'TS43+TS45+TS48'),
  ('TS55.5',  'TS59+TS61+TS63+TS64+TS66')
) as v(id, bt)
join public.chi_tieu c on c.id = v.id
on conflict (id_chi_tieu) do update
  set bieu_thuc = excluded.bieu_thuc,
      bang      = excluded.bang;

-- Kiểm tra kết quả nạp:
--   select bang, id_chi_tieu, bieu_thuc from public.cong_thuc_chi_tieu order by bang, id_chi_tieu;
--
-- ⚠️ LƯU Ý: công thức TT4.2 hiện chỉ có 7 số hạng trong khi TT4.1 có 8.
--    Chỗ tương ứng với TT115 đang trống. Nếu đó là thiếu sót, hãy bổ sung
--    tại admin.html → 🧮 Công thức (không cần chạy lại file SQL này).
