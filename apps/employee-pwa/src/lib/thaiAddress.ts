import { searchAddressByProvince } from "thailand-address-database";

export interface ThaiAddressEntry {
  tambon: string;
  amphoe: string;
  province: string;
  zipcode: string;
}

// The library has no "list everything" call, only fuzzy substring search — and an
// empty search string matches nothing (rather than everything, as `.includes("")`
// would suggest), so there's no reliable way to enumerate provinces from the library
// itself. The 77 provinces are a fixed, official list that doesn't change, so it's
// hardcoded here; per-province amphoe/tambon/zipcode lookups still go through the
// library's search (verified to return complete, correct results for an exact
// province name), cached per province since each is a full ~200KB dataset scan.
export const THAI_PROVINCES = [
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พะเยา",
  "พระนครศรีอยุธยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยโสธร",
  "ยะลา",
  "ร้อยเอ็ด",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุตรดิตถ์",
  "อุทัยธานี",
  "อุบลราชธานี",
] as const;

const entriesByProvince = new Map<string, ThaiAddressEntry[]>();
function entriesFor(province: string): ThaiAddressEntry[] {
  let entries = entriesByProvince.get(province);
  if (!entries) {
    entries = searchAddressByProvince(province, 2000).filter((e) => e.province === province);
    entriesByProvince.set(province, entries);
  }
  return entries;
}

export function listProvinces(): string[] {
  return [...THAI_PROVINCES].sort((a, b) => a.localeCompare(b, "th"));
}

export function listAmphoes(province: string): string[] {
  return Array.from(new Set(entriesFor(province).map((e) => e.amphoe))).sort((a, b) => a.localeCompare(b, "th"));
}

export function listTambons(province: string, amphoe: string): { tambon: string; zipcode: string }[] {
  return entriesFor(province)
    .filter((e) => e.amphoe === amphoe)
    .map((e) => ({ tambon: e.tambon, zipcode: e.zipcode }))
    .sort((a, b) => a.tambon.localeCompare(b.tambon, "th"));
}
